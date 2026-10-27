-- Ce Facem în Timișoara? — core schema
-- Requires PostGIS. On Supabase: Database → Extensions → postgis (or the statement below).
create extension if not exists postgis;

-- ---------------------------------------------------------------------------
-- Central configuration (geofence). Only admins/service role can change it.
-- ---------------------------------------------------------------------------
create table if not exists app_config (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

insert into app_config (key, value) values
  ('geofence', '{"center_lat": 45.7489, "center_lng": 21.2087, "max_meters": 50000}'::jsonb)
on conflict (key) do nothing;

-- The configured radius can be lowered, never raised above 50 km.
alter table app_config add constraint geofence_max_cap check (
  key <> 'geofence' or ((value->>'max_meters')::numeric > 0 and (value->>'max_meters')::numeric <= 50000)
);

-- ---------------------------------------------------------------------------
-- Lookups
-- ---------------------------------------------------------------------------
create table if not exists categories (
  id text primary key,
  label text not null,
  sort int not null default 0
);

create table if not exists age_groups (
  id text primary key,
  label text not null,
  min_age int not null,
  max_age int not null,
  sort int not null default 0
);

-- ---------------------------------------------------------------------------
-- Sources & runs
-- ---------------------------------------------------------------------------
create table if not exists sources (
  id text primary key,
  name text not null,
  homepage text not null,
  adapter text not null,                 -- ical | tribe | jsonld | teatrul-german | manual
  config jsonb not null default '{}'::jsonb,
  enabled boolean not null default true,
  auto_publish boolean not null default false, -- trusted official sources may auto-publish verified events
  access_notes text,                     -- robots/terms review notes
  last_run_at timestamptz,
  last_status text,
  created_at timestamptz not null default now()
);

create table if not exists source_runs (
  id uuid primary key default gen_random_uuid(),
  source_id text not null references sources(id) on delete cascade,
  slot_key text not null,                -- e.g. 2026-10-27T06 (Bucharest) or manual-<uuid>
  trigger text not null default 'schedule', -- schedule | manual
  status text not null default 'running' check (status in ('running','succeeded','failed','skipped')),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  stats jsonb not null default '{}'::jsonb,
  error text,
  unique (source_id, slot_key)            -- idempotency: one run per source per slot
);

create table if not exists ingestion_errors (
  id uuid primary key default gen_random_uuid(),
  run_id uuid references source_runs(id) on delete cascade,
  source_id text references sources(id) on delete cascade,
  stage text not null,                   -- fetch | parse | geocode | geofence | enrich | persist
  message text not null,
  payload jsonb,
  resolved boolean not null default false,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Organizers & venues
-- ---------------------------------------------------------------------------
create table if not exists organizers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  name_norm text not null unique,
  website text,
  -- Registered address of the organizer. NEVER used to place an event.
  address text,
  created_at timestamptz not null default now()
);

create table if not exists venues (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  name_norm text not null,
  address text,
  locality text not null default 'Timișoara',
  location geography(Point, 4326),
  distance_m double precision,
  distance_km numeric(6,2),
  geo_status text not null default 'unverified' check (geo_status in ('unverified','verified','out_of_radius')),
  geo_source text,                       -- source_geo | nominatim | admin | known_venue
  geo_confidence numeric(3,2),
  geo_uncertainty_m double precision,
  verified_at timestamptz,
  verified_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (name_norm, locality)
);
create index if not exists venues_location_gix on venues using gist (location);

-- ---------------------------------------------------------------------------
-- Events
-- ---------------------------------------------------------------------------
create table if not exists events (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  kind text not null default 'scheduled' check (kind in ('scheduled','evergreen')),
  status text not null default 'needs_review'
    check (status in ('draft','needs_review','published','rejected','canceled','archived')),
  title text not null,
  summary text not null default '',
  description text,
  image_url text,
  image_credit text,
  organizer_id uuid references organizers(id) on delete set null,
  venue_id uuid references venues(id) on delete restrict,
  attendance_mode text not null default 'offline' check (attendance_mode in ('offline','online','hybrid')),
  indoor_outdoor text not null default 'unknown' check (indoor_outdoor in ('indoor','outdoor','mixed','unknown')),
  -- A. official restrictions (from organizer/law only)
  official_min_age int check (official_min_age between 0 and 99),
  official_max_age int check (official_max_age between 0 and 120),
  -- B/C. recommendations (AI or rules) live in event_age_groups + these flags
  all_ages boolean not null default false,
  family_friendly boolean not null default false,
  -- D. confirmed accessibility info only
  accessibility text,
  is_free boolean,
  price_min numeric(10,2),
  price_max numeric(10,2),
  currency text,
  ticket_url text,
  opening_hours jsonb,                   -- evergreen: verified hours only
  uncertainty_note text,
  review_reason text,
  admin_locked boolean not null default false, -- admin edited: ingestion no longer overwrites texts/classification
  ai_confidence numeric(3,2),
  ai_evidence jsonb,
  primary_source_id text references sources(id) on delete set null,
  is_demo boolean not null default false,
  last_verified_at timestamptz not null default now(),
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists events_status_idx on events (status);
create index if not exists events_venue_idx on events (venue_id);

create table if not exists event_sessions (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events(id) on delete cascade,
  starts_at timestamptz not null,
  ends_at timestamptz,
  all_day boolean not null default false,
  status text not null default 'scheduled' check (status in ('scheduled','canceled','postponed','sold_out')),
  check (ends_at is null or ends_at >= starts_at),
  unique (event_id, starts_at)
);
create index if not exists event_sessions_time_idx on event_sessions (starts_at, ends_at);

create table if not exists event_categories (
  event_id uuid not null references events(id) on delete cascade,
  category_id text not null references categories(id),
  primary key (event_id, category_id)
);

create table if not exists event_age_groups (
  event_id uuid not null references events(id) on delete cascade,
  age_group_id text not null references age_groups(id),
  source text not null default 'ai' check (source in ('ai','rules','admin')),
  confidence numeric(3,2),
  primary key (event_id, age_group_id)
);

create table if not exists event_sources (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events(id) on delete cascade,
  source_id text not null references sources(id) on delete cascade,
  external_id text not null,
  url text not null,
  link_ok boolean,
  raw jsonb,
  content_hash text,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  unique (source_id, external_id)
);
create index if not exists event_sources_event_idx on event_sources (event_id);

create table if not exists duplicate_pairs (
  id uuid primary key default gen_random_uuid(),
  event_a uuid not null references events(id) on delete cascade,
  event_b uuid not null references events(id) on delete cascade,
  score numeric(3,2) not null,
  method text not null default 'rules',
  status text not null default 'open' check (status in ('open','merged','dismissed')),
  created_at timestamptz not null default now(),
  unique (event_a, event_b)
);

create table if not exists geocoding_cache (
  query_key text primary key,
  provider text not null,
  result jsonb,                          -- null = provider returned nothing (negative cache)
  created_at timestamptz not null default now()
);

create table if not exists event_submissions (
  id uuid primary key default gen_random_uuid(),
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  title text not null check (char_length(title) between 3 and 200),
  description text check (char_length(description) <= 5000),
  starts_at timestamptz not null,
  ends_at timestamptz,
  venue_name text not null check (char_length(venue_name) <= 200),
  venue_address text not null check (char_length(venue_address) <= 300),
  locality text not null check (char_length(locality) <= 100),
  organizer_name text check (char_length(organizer_name) <= 200),
  official_min_age int check (official_min_age between 0 and 99),
  is_free boolean,
  price_text text check (char_length(price_text) <= 200),
  ticket_url text check (char_length(ticket_url) <= 500),
  source_url text check (char_length(source_url) <= 500),
  contact_email text not null check (char_length(contact_email) <= 200),
  -- server-side pre-check results (geocoding + distance) for the moderator
  geocode jsonb,
  distance_km numeric(6,2),
  geo_verdict text,
  event_id uuid references events(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists admin_users (
  user_id uuid primary key,
  email text not null,
  created_at timestamptz not null default now()
);

create table if not exists admin_reviews (
  id uuid primary key default gen_random_uuid(),
  event_id uuid references events(id) on delete cascade,
  submission_id uuid references event_submissions(id) on delete cascade,
  action text not null,                  -- approve | reject | edit | relocate | cancel | merge | revalidate | auto_*
  reason text,
  details jsonb,
  admin_id uuid,
  created_at timestamptz not null default now()
);
create index if not exists admin_reviews_event_idx on admin_reviews (event_id);
