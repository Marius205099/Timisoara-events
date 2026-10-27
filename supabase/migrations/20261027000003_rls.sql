-- Row Level Security. Visitors (anon) read only geofence-valid published data.
-- Admins are Supabase Auth users listed in admin_users. Ingestion uses the
-- service role (bypasses RLS) but is still bound by the geofence triggers.

create or replace function is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from admin_users where user_id = auth.uid())
$$;

alter table app_config enable row level security;
alter table categories enable row level security;
alter table age_groups enable row level security;
alter table sources enable row level security;
alter table source_runs enable row level security;
alter table ingestion_errors enable row level security;
alter table organizers enable row level security;
alter table venues enable row level security;
alter table events enable row level security;
alter table event_sessions enable row level security;
alter table event_categories enable row level security;
alter table event_age_groups enable row level security;
alter table event_sources enable row level security;
alter table duplicate_pairs enable row level security;
alter table geocoding_cache enable row level security;
alter table event_submissions enable row level security;
alter table admin_users enable row level security;
alter table admin_reviews enable row level security;

-- Public lookups
create policy categories_read on categories for select using (true);
create policy age_groups_read on age_groups for select using (true);
create policy sources_public_read on sources for select using (true);

-- Public event data: only what passes the geofence.
create policy venues_public_read on venues for select
  using (geo_status = 'verified' and within_geofence(location));
create policy events_public_read on events for select
  using (status in ('published','canceled') and attendance_mode <> 'online' and venue_is_publishable(venue_id));
create policy sessions_public_read on event_sessions for select
  using (exists (select 1 from events e where e.id = event_id));       -- inherits events policy
create policy event_categories_public_read on event_categories for select
  using (exists (select 1 from events e where e.id = event_id));
create policy event_age_groups_public_read on event_age_groups for select
  using (exists (select 1 from events e where e.id = event_id));
create policy event_sources_public_read on event_sources for select
  using (exists (select 1 from events e where e.id = event_id));
create policy organizers_public_read on organizers for select using (true);

-- Admin: full access everywhere (writes still pass through the geofence triggers).
do $$
declare t text;
begin
  foreach t in array array['app_config','categories','age_groups','sources','source_runs','ingestion_errors',
    'organizers','venues','events','event_sessions','event_categories','event_age_groups','event_sources',
    'duplicate_pairs','geocoding_cache','event_submissions','admin_reviews']
  loop
    execute format('create policy %I on %I for all to authenticated using (is_admin()) with check (is_admin())', t || '_admin_all', t);
  end loop;
end $$;

create policy admin_users_self_read on admin_users for select to authenticated using (user_id = auth.uid() or is_admin());

-- Organizers' public submissions go through the server API (service role) after
-- validation and rate limiting; anon has no direct insert.

-- Column-level hardening: raw scraped payloads and private review data are not public.
revoke all on event_sources from anon;
grant select (id, event_id, source_id, external_id, url, last_seen_at) on event_sources to anon;
revoke all on event_submissions, admin_reviews, ingestion_errors, source_runs, geocoding_cache, duplicate_pairs, admin_users, app_config from anon;
revoke insert, update, delete on all tables in schema public from anon;
grant select on public_events to anon, authenticated;
grant execute on function public_events_between(timestamptz, timestamptz) to anon, authenticated;
revoke execute on function set_venue_location(uuid, float8, float8, text, numeric, uuid) from anon;
