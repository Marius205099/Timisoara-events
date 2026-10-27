# PRD — Ce Facem în Timișoara?

## Problem
People in and around Timișoara have no single, fast, trustworthy place to answer:
**"What can I do this Saturday, in Timișoara or within 50 km, for my age / my family?"**
Information is scattered across theatre sites, ticketing platforms, municipal pages and social media.

## Goal
A public, registration-free, Romanian-first website where a visitor on an iPhone (Safari)
gets a genuine answer **within 10 seconds**: open → tap *Sâmbătă* → (optionally) tap an age group → see real events
with verified dates, venue, distance and source link.

## Users
Children (via parents), teenagers, adults, seniors, couples, families, groups of friends; organizers (submissions);
one or more administrators (moderation).

## Hard constraint — the 50 km geofence
Only events whose **verified venue coordinates** are within **50,000 m geodesic distance** (inclusive) of
45.7489 N, 21.2087 E are published. Enforced at ingestion, at publish time (DB trigger), in public queries
(view + RLS), in admin actions and in the public API. Online-only events are excluded; hybrid only with a verified
physical venue. Unknown or low-confidence locations go to moderation. Organizer addresses are never used.
The radius is centrally configurable **downwards only**; visitors cannot change it.

## Functional requirements
| Area | Requirement |
|---|---|
| Home | Headline/subtitle; quick dates Azi, Mâine, Sâmbătă, Duminică, Weekend, Alege data (Europe/Bucharest, DST-safe) |
| Filters | Age groups (multi), ALL AGES default, FAMILY mode, category, free/paid, indoor/outdoor, morning/afternoon/evening, locality, distance band 0–10/10–25/25–50, family-friendly, confirmed accessibility, text search |
| Cards | Image only when legally usable, title, date/time, venue + locality, distance, age suitability, category, price, source, details link |
| Detail | Summary, all dates, venue + address, distance, map + directions, organizer, official age restriction, recommended ages, price, ticket link, source links, last verification, cancellation/uncertainty warnings |
| Event types | Scheduled events vs evergreen attractions (never presented as scheduled; hours shown only if verified) |
| Ingestion | 06:00 & 18:00 Bucharest, idempotent, retries, robots.txt, rate limits, provenance, dedupe, cancellation detection |
| AI | Server-side classification (categories, age groups, family flag), original RO summary, uncertainty flags, confidence + evidence stored; never location/dates/prices/restrictions |
| Admin | Review/approve/reject, sources, coordinates & distance, relocate venue, manual ingestion, errors, duplicates, edit, source toggles, cancel/remove, submissions, stats |
| Submissions | Public form, server-side geocode pre-check, always moderated |
| SEO | Event pages, metadata, OG images, sitemap, canonical URLs, schema.org Event JSON-LD, robots |

## Age model (kept separate)
A. Official min/max age (from organizer only) — hard filter.
B. Recommended age groups (AI/rules/admin) — relevance.
C. All-ages / family-friendly flags.
D. Accessibility (confirmed info only).

## Non-goals (MVP)
User accounts, favourites, payments, scraping Facebook/Instagram, bypassing any access control.

## Success metrics
- Time-to-answer on iPhone Safari < 10 s (home TTFB + 2 taps).
- 0 published events beyond 50 km (enforced by DB; monitored by `out_of_radius` counts).
- ≥ 95 % of published events with a working source link.
- Twice-daily runs succeed ≥ 95 % of slots.
