# Implementation plan & status

| Phase | Scope | Status |
|---|---|---|
| 1 | PRD, architecture, plan | ✅ done |
| 2 | Mobile-first UI with clearly labelled demo data | ✅ done (`src/app`, `src/data/demo.ts`) |
| 3 | Database + strict geospatial filtering | ✅ done — migrations, triggers, view, RLS; DB tests on PostGIS |
| 4 | Ingestion adapters, real permitted sources | ✅ 4 sources (TNTM iCal, Filarmonica API, Teatrul German, iaBilet JSON-LD); tested on real snapshots and live |
| 5 | AI enrichment & age classification | ✅ Claude structured output + rules fallback (AI path needs an API key to run live) |
| 6 | Admin dashboard & moderation | ✅ review, status, edit, relocate, sources, runs, errors, submissions, duplicates |
| 7 | Scheduled ingestion & monitoring | ✅ GitHub Actions cron + slot idempotency + run stats/errors; `/api/cron/ingest` |
| 8 | Replace demo data with verified real events | ✅ locally (`DEMO_DATA=off npm run ingest -- --manual`); production after Supabase setup |
| 9 | Tests: Safari, geofence, security | ✅ Vitest (unit + PostGIS DB); Playwright WebKit iPhone profile |
| 10 | Deployment | ⏳ needs your GitHub/Supabase/Vercel accounts — see README |

## Next sources to add (need review of terms or an official feed)
- Opera Națională Română Timișoara, Teatrul Maghiar „Csiky Gergely”, Teatrul Merlin — sites were not reachable from
  the build environment; add via `jsonld`/`ical` adapters once a feed is confirmed.
- Primăria Timișoara / Centrul de Proiecte agendas — no machine-readable feed found; use admin entry or request a feed.
- Muzeul Național de Artă, Muzeul Banatului — evergreen attractions with verified opening hours (admin entry).
- Eventbook, Entertix, Bilete.ro, MyTicket — check terms; Entertix links already appear as ticket URLs.
- Facebook/Instagram — not scraped; only via official APIs with permission, or organizer submissions.

## Known limitations
- Nominatim is rate-limited (1 req/s); first runs are slow, later runs hit the cache.
- Images from sources are stored but not displayed until a usage basis is recorded (`image_credit`).
- Duplicate detection is rules-based; AI-assisted suggestions can be added on top of `duplicate_pairs`.
