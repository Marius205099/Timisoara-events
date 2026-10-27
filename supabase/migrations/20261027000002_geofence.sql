-- Database-level 50 km safeguard. These triggers run for EVERY writer, including
-- the service role used by ingestion, so no code path can publish an event whose
-- verified venue lies outside the radius.

-- security definer: RLS policies evaluated for anonymous visitors call these, and
-- app_config itself is not readable by anon.
create or replace function geofence_center() returns geography
language sql stable security definer set search_path = public, extensions as $$
  select st_setsrid(st_makepoint((value->>'center_lng')::float8, (value->>'center_lat')::float8), 4326)::geography
  from app_config where key = 'geofence'
$$;

-- least(...) keeps the hard cap even if the config row were tampered with.
create or replace function geofence_max_meters() returns float8
language sql stable security definer set search_path = public as $$
  select least(coalesce((select (value->>'max_meters')::float8 from app_config where key = 'geofence'), 50000), 50000)
$$;

-- 1 mm tolerance: a venue exactly on the boundary is included (spheroid math, inclusive).
create or replace function within_geofence(p geography) returns boolean
language sql stable as $$
  select p is not null and st_dwithin(p, geofence_center(), geofence_max_meters() + 0.001, true)
$$;

create or replace function venue_is_publishable(p_venue_id uuid) returns boolean
language sql stable security definer set search_path = public, extensions as $$
  select exists (
    select 1 from venues v
    where v.id = p_venue_id and v.geo_status = 'verified' and within_geofence(v.location)
  )
$$;

-- ---------------------------------------------------------------------------
-- Venues: distance is always computed by the database; status is downgraded
-- automatically when coordinates are missing or outside the radius.
-- ---------------------------------------------------------------------------
create or replace function venues_geo_guard() returns trigger
language plpgsql as $$
begin
  new.name_norm := lower(unaccent_ro(new.name));
  new.updated_at := now();
  -- Moving a venue without re-verifying it drops it back to 'unverified'.
  if tg_op = 'UPDATE' and old.location is distinct from new.location
     and new.verified_at is not distinct from old.verified_at then
    new.geo_status := 'unverified';
  end if;
  if new.location is null then
    new.distance_m := null;
    new.distance_km := null;
    new.geo_status := 'unverified';
  else
    new.distance_m := st_distance(new.location, geofence_center(), true);
    new.distance_km := round((new.distance_m / 1000.0)::numeric, 2);
    if not within_geofence(new.location) then
      new.geo_status := 'out_of_radius';
    end if;
  end if;
  return new;
end $$;

-- Lightweight Romanian diacritics folding (no dependency on the unaccent extension).
create or replace function unaccent_ro(t text) returns text
language sql immutable as $$
  select translate(coalesce(t, ''), 'ăâîșşțţĂÂÎȘŞȚŢéèëüöő', 'aaissttAAISSTTeeeuoo')
$$;

drop trigger if exists venues_geo_guard on venues;
create trigger venues_geo_guard before insert or update on venues
for each row execute function venues_geo_guard();

-- When a venue moves (or loses verification), every published event there is re-validated.
create or replace function venues_revalidate_events() returns trigger
language plpgsql as $$
begin
  if (old.location is distinct from new.location) or (old.geo_status is distinct from new.geo_status) then
    if not (new.geo_status = 'verified' and within_geofence(new.location)) then
      update events
         set status = 'needs_review',
             review_reason = format('Locația sălii s-a schimbat și nu mai este verificată în raza de %s km (status: %s).',
                                    geofence_max_meters() / 1000, new.geo_status)
       where venue_id = new.id and status in ('published', 'canceled');
    end if;
    insert into admin_reviews (event_id, action, reason, details)
    select e.id, 'revalidate', 'venue location changed',
           jsonb_build_object('venue_id', new.id, 'distance_km', new.distance_km, 'geo_status', new.geo_status)
      from events e where e.venue_id = new.id;
  end if;
  return new;
end $$;

drop trigger if exists venues_revalidate_events on venues;
create trigger venues_revalidate_events after update on venues
for each row execute function venues_revalidate_events();

-- ---------------------------------------------------------------------------
-- Events: publishing safeguard.
-- ---------------------------------------------------------------------------
create or replace function events_publish_guard() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  if new.status in ('published', 'canceled') then
    if new.attendance_mode = 'online' then
      raise exception 'GEOFENCE_VIOLATION: online-only events cannot be published' using errcode = 'P0001';
    end if;
    if new.venue_id is null or not venue_is_publishable(new.venue_id) then
      raise exception 'GEOFENCE_VIOLATION: event % has no verified venue within % m of Timișoara center',
        new.id, geofence_max_meters() using errcode = 'P0001';
    end if;
    if new.official_min_age is not null and new.official_max_age is not null and new.official_min_age > new.official_max_age then
      raise exception 'INVALID_AGE_RANGE' using errcode = 'P0001';
    end if;
    if new.status = 'published' and (tg_op = 'INSERT' or old.status is distinct from 'published') then
      new.published_at := coalesce(new.published_at, now());
    end if;
  end if;
  return new;
end $$;

drop trigger if exists events_publish_guard on events;
create trigger events_publish_guard before insert or update on events
for each row execute function events_publish_guard();

-- ---------------------------------------------------------------------------
-- Public read model. Every row is re-checked against the geofence here too.
-- ---------------------------------------------------------------------------
create or replace view public_events with (security_barrier = true) as
select
  e.id, e.slug, e.kind, e.status, e.title, e.summary, e.description, e.image_url, e.image_credit,
  e.attendance_mode, e.indoor_outdoor, e.official_min_age, e.official_max_age, e.all_ages,
  e.family_friendly, e.accessibility, e.is_free, e.price_min, e.price_max, e.currency, e.ticket_url,
  e.opening_hours, e.uncertainty_note, e.ai_confidence, e.is_demo, e.last_verified_at, e.updated_at,
  o.name as organizer_name,
  jsonb_build_object(
    'id', v.id, 'name', v.name, 'address', v.address, 'locality', v.locality,
    'lat', st_y(v.location::geometry), 'lng', st_x(v.location::geometry),
    'distance_km', v.distance_km, 'geo_status', v.geo_status, 'geo_source', v.geo_source,
    'geo_confidence', v.geo_confidence
  ) as venue,
  coalesce((select jsonb_agg(jsonb_build_object('id', s.id, 'starts_at', s.starts_at, 'ends_at', s.ends_at,
                    'all_day', s.all_day, 'status', s.status) order by s.starts_at)
              from event_sessions s where s.event_id = e.id), '[]'::jsonb) as sessions,
  coalesce((select jsonb_agg(c.category_id) from event_categories c where c.event_id = e.id), '[]'::jsonb) as categories,
  coalesce((select jsonb_agg(a.age_group_id) from event_age_groups a where a.event_id = e.id), '[]'::jsonb) as age_groups,
  coalesce((select jsonb_agg(jsonb_build_object('source_id', es.source_id, 'source_name', src.name, 'url', es.url,
                    'external_id', es.external_id, 'last_seen_at', es.last_seen_at))
              from event_sources es join sources src on src.id = es.source_id where es.event_id = e.id), '[]'::jsonb) as sources
from events e
join venues v on v.id = e.venue_id
left join organizers o on o.id = e.organizer_id
where e.status in ('published', 'canceled')
  and e.attendance_mode <> 'online'
  and v.geo_status = 'verified'
  and within_geofence(v.location);

-- Date-window query used by the public API. Evergreen activities are always returned
-- (the app labels them as such); scheduled events need a session overlapping the window.
create or replace function public_events_between(p_from timestamptz, p_to timestamptz)
returns setof public_events
language sql stable as $$
  select pe.* from public_events pe
  where pe.kind = 'evergreen'
     or exists (
       select 1 from event_sessions s
       where s.event_id = pe.id
         and s.starts_at <= p_to
         and coalesce(s.ends_at, s.starts_at) >= p_from
     )
$$;

-- Admin helper: set a venue's coordinates (distance & status recomputed by trigger).
create or replace function set_venue_location(p_venue_id uuid, p_lat float8, p_lng float8, p_source text, p_confidence numeric, p_admin uuid default null)
returns venues
language plpgsql as $$
declare v venues;
begin
  update venues
     set location = st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography,
         geo_status = 'verified',
         geo_source = p_source,
         geo_confidence = p_confidence,
         verified_at = clock_timestamp(),
         verified_by = p_admin
   where id = p_venue_id
  returning * into v;
  return v;
end $$;
