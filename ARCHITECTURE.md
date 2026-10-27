# Architecture

```
                ┌──────────── GitHub Actions (cron 03,04,15,16 UTC) ─────────────┐
                │  npm run ingest → slotFor() → 06:00 / 18:00 Europe/Bucharest     │
                └───────────────┬──────────────────────────────────────────────────┘
                                │ DATABASE_URL (service connection)
Sources ──► Adapters ──► verifyVenueLocation ──► decideStatus ──► enrich (AI|rules) ──► Postgres
(iCal, Tribe API,  (raw facts)  (known venues → source GEO →     (publish / review /    (Claude, server)    + PostGIS
 JSON-LD, HTML)                  Nominatim, 50 km check)          reject)                                  triggers
                                                                                                             │
Visitors (iPhone Safari) ──► Next.js on Vercel ──► public_events view / RLS ◄────────────────────────────────┘
Admins ──► /admin (Supabase Auth) ──► writes as the admin user under RLS (+ triggers)
```

## Layers
| Layer | Location | Notes |
|---|---|---|
| UI | `src/app`, `src/components` | App Router, server components, URL-driven filters; client JS only for filter chips & sheet |
| Domain (pure) | `src/lib` | `geo.ts` (Karney geodesics on WGS84, inclusive 50 km), `dates.ts` (Luxon, Europe/Bucharest), `age.ts`, `filters.ts`, `dedupe.ts`, `query.ts` |
| Data | `src/data` | `db.ts` (one SQL interface: postgres.js for Supabase, PGlite+PostGIS for local/demo/tests), `public.ts`, `admin.ts`, `submissions.ts`, `demo.ts` |
| Ingestion | `src/ingestion` | `adapters/*`, `http.ts` (robots.txt, UA, per-host delay, retries), `geocode.ts` (Nominatim + DB cache), `locate.ts`, `enrich.ts`, `pipeline.ts`, `schedule.ts`, `sources.ts`, `known-venues.ts` |
| Database | `supabase/migrations` | schema, geofence functions/triggers/view, RLS, seed (generated) |

## The 50 km rule — defense in depth
1. **Ingestion** (`locate.ts`): only the event's own venue is considered; organizer data is not even passed in.
   Exact coordinates (admin/registry/source GEO) → inclusive geodesic check. Geocoded coordinates carry an
   uncertainty radius: `d − u > 50 km` ⇒ reject, low confidence or `d + u > 50 km` ⇒ review, else verified.
2. **Database** (`…_geofence.sql`): `venues_geo_guard` computes `distance_m/distance_km` with PostGIS
   (spheroid) and downgrades venues outside the radius / moved without re-verification;
   `events_publish_guard` raises `GEOFENCE_VIOLATION` for any `published`/`canceled` event without a verified
   venue inside the radius, or online-only — for every role, including the service role.
3. **Revalidation**: `venues_revalidate_events` sends published events back to review when their venue moves or
   loses verification; the pipeline re-verifies when a source changes an event's venue.
4. **Public reads**: `public_events` view and RLS policies re-check `within_geofence()`; app code re-checks
   every row (`isPubliclyVisible`) before rendering or returning JSON.
5. **Config**: `app_config.geofence.max_meters` has a CHECK `<= 50000`; `geofence_max_meters()` also applies
   `least(…, 50000)`; the env override can only lower it. No public parameter controls the radius.

## Scheduling
GitHub Actions (free, no serverless time limit) fires at 03, 04, 15, 16 UTC. `slotFor()` maps the current time to
`YYYY-MM-DDT06` / `T18` only within [06:00, 08:00) and [18:00, 20:00) Bucharest time — correct in EET and EEST.
`source_runs (source_id, slot_key)` is UNIQUE, so duplicate triggers are no-ops (idempotency). Each source run records
stats; failures are logged in `ingestion_errors`. `/api/cron/ingest` offers the same entry point for HTTP schedulers.

## AI
`enrich.ts` calls Claude (default `claude-sonnet-5-5`, configurable `AI_MODEL`) via the official SDK with a
Zod-validated structured output, server-side only. Output: categories, recommended age groups, all-ages/family
flags, indoor/outdoor, original RO summary, uncertainties, evidence, confidence. Deterministic code still clamps
recommendations against official restrictions. Without a key (or on failure/refusal) a rules classifier runs.

## Security
- Secrets only in server env; no keys in client bundles. `server-only` guards auth code.
- RLS on every table; anon reads only geofence-valid data; raw payloads/submissions/errors are not readable by anon.
- Admin writes run as `authenticated` with `request.jwt.claim.sub` = admin id (same as PostgREST), so RLS applies.
- Security headers (HSTS, nosniff, frame deny, referrer policy), `/admin` noindex.
- Submissions: Zod validation, honeypot, per-IP rate limit, always moderated.
- Ingestion: robots.txt honoured, identified UA, stop on 401/403/429, no CAPTCHA/login bypass.

## Local/demo mode
Without `DATABASE_URL` the app boots an embedded PostGIS (PGlite) under `.data/pglite`, applies the same migrations
and seeds clearly labelled DEMO events (unless `DEMO_DATA=off`). The same triggers and RLS run, so local behaviour
matches production.
