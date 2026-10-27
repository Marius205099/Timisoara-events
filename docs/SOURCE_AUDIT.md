# Source coverage & ingestion audit — 2026-10-27

## Method
Each candidate was checked from the build environment for: reachability, `robots.txt` rules for the paths used,
a machine-readable format (official API, iCal, schema.org JSON-LD, stable HTML), and whether venues carry an address
or coordinates. Nothing behind a login, CAPTCHA or paywall is used. Requests identify themselves
(`CeFacemTimisoaraBot/1.0`), are spaced ≥ 1.5 s per host and stop on 401/403/429.

## Integrated sources
| Source | Adapter | Format | robots.txt | Location data | Auto-publish |
|---|---|---|---|---|---|
| Teatrul Național „Mihai Eminescu” (tntm.ro) | `ical` | Official iCal export `/events.ics` | `Allow: /` | `GEO` per venue + address; `CATEGORIES` carries official age (`+16 ani`) | yes |
| Filarmonica Banatul (filarmonicabanatul.ro) | `tribe` | The Events Calendar REST API `/wp-json/tribe/events/v1/events` | only `/wp-admin/` disallowed | Venue name + street; matched to the verified venue registry or geocoded | yes |
| Teatrul German de Stat (teatrulgerman.ro) | `teatrul-german` | Public programme HTML `/ro/program/` | no restrictions | Home venue known; touring dates name the city (e.g. Oradea) | yes |
| iaBilet.ro (Timișoara pages) | `jsonld` | schema.org `Event` JSON-LD on event pages | event pages allowed (`/cos/`, `/account/` etc. disallowed) | `Place` with street address | yes (review ToS) |
| Organizer submissions | `manual` | Public form | — | Geocoded pre-check | never (moderated) |
| Admin entries | `manual` | Admin | — | Admin-verified | per admin |

## Candidates not integrated (yet)
| Candidate | Finding | Next step |
|---|---|---|
| Opera Națională Română Timișoara, Teatrul Maghiar, Teatrul Merlin, Muzeul Național de Artă, timisoara.ro, Centrul de Proiecte | Not reachable from the build environment (connection failed) | Re-check from production; prefer iCal/JSON-LD; else admin entry |
| Primăria Timișoara (primariatm.ro) | Reachable; no event feed / structured data found | Ask for a feed; admin entry |
| Muzeul Banatului | Reachable; no feed; feeds disallowed in robots.txt | Evergreen attraction via admin with verified hours |
| visit-timisoara.com, CJ Timiș, UVT | Reachable; WordPress without an events API | Check RSS/JSON-LD on event pages; admin entry |
| Eventbook, Entertix, Bilete.ro, MyTicket | Reachable; no structured list found on city pages | Review terms; Entertix/Eventim links already arrive as ticket URLs |
| allevents.in | JSON-LD present, but it is a re-aggregator with restrictive terms | Not used (prefer primary sources) |
| Facebook / Instagram | No scraping | Only official APIs with permission, or submissions |

## Live run results (2026-10-27, local embedded DB, rules classifier — no AI key)
| Source | Fetched | Published | In review | Rejected (> 50 km) |
|---|---|---|---|---|
| Filarmonica Banatul | 41 | 41 | 0 | 0 |
| iaBilet (Timișoara pages) | 59 | 56 | 2 | 1 — *BEACH, PLEASE! Festival*, Costinești, 619.9 km |
| Teatrul German | 12 | 11 | 0 | 1 — *Penthesilea*, Festivalul Interetnic Oradea, 155.4 km |
| TNTM | 19 | 19 | 0 | 0 |
| **Total** | **131** | **127** | **2** | **2** |

- Public feed maximum distance: **5.48 km** (all published venues are in Timișoara; none in surrounding localities yet).
- Source links: **40/40** sampled published links reachable.
- Duplicates merged across sources: 0 in this run (no overlapping listings detected).
- Remaining review items: 2 iaBilet venues whose addresses OpenStreetMap could not match precisely.

### Issues found by the live run and fixed
1. iaBilet marks shows moved to a new date as `EventRescheduled` (with the new `startDate`). They were first
   treated as postponed (12 in review); now published with a "reprogramat" notice. `EventPostponed` still goes to review.
2. Street abbreviations (`Bv.`, `Str.`, `Bd.`…) and postal codes defeated geocoding (16 in review); addresses are now
   normalized, and a street-level match in the right town is accepted when its full extent is inside the radius.
3. TNTM/Filarmonica feeds carry no genre; per-source category hints were added (`teatru`, `concert`).

### Coverage gaps
- **Children & families**: the integrated sources are mostly theatre/concerts/stand-up. Teatrul Merlin, the
  Opera's children's shows, museums and municipal family events need feeds or admin entry.
- **Surrounding localities (Dumbrăvița, Giroc, Recaș, Buziaș…)**: no source found yet; rely on submissions/admin
  until local town halls or venues offer a feed.

## Extension — 2026-10-27 (press, City Hall, public and private organisations)

About 55 sites were checked for public access, robots.txt, and a machine-readable event format
(iCal, The Events Calendar API, WordPress REST, schema.org Event JSON-LD).

### Added
| Source | Format | Notes |
|---|---|---|
| Visit Timișoara (Primăria Timișoara / OMD) | WordPress REST `/wp-json/wp/v2/events-visit` | Official city portal; Romanian records only. No venue field: read from the ticket page's JSON-LD or the venue registry, otherwise review. |
| Zile și Nopți Timișoara | JSON-LD on event pages (geo coordinates, one node per performance) | General, weekend, kids and culture listings plus 21 day listings. |
| Timisoreni.ro | JSON-LD ItemList on the events hub + detail pages | Venue taken from the hub when the detail page only names the town; Cinema City film listings excluded. |
| FABER | JSON-LD on event pages | Single venue; hall names are prefixed with “FABER Timișoara”. |

### Checked, not added (no usable structured event data, or access restricted)
- **Local press** — tion.ro, pressalert.ro, opiniatimisoarei.ro, banatulmeu.ro, debanat.ro, ziuadevest.ro,
  renasterea.ro, timisplus.ro: news articles only, no agenda with structured date + venue. Extracting events
  from articles needs the AI step (`ANTHROPIC_API_KEY`) and moderation; the events they cover come from the
  institutions and agendas already ingested.
- **Primăria Timișoara** (primariatm.ro): links to Facebook events and to visit-timisoara.com (ingested);
  timisoara-info.ro (Infocentru) redirects to the same portal.
- **Centrul de Proiecte** (centruldeproiecte.ro): calendar is rendered client-side, REST records have no dates.
- **Consiliul Județean Timiș / CECART**: news posts only. **UVT / UPT**: internal academic events, no dates in the API.
- **Iulius Town**: free-text dates; its events are listed by Zile și Nopți (ingested).
- **Opera Națională Română** (ort.ro): TLS certificate error. **Muzeul de Artă**: connection reset.
- **Kompostor, Entertix, LiveTickets, bilete.ro**: no Event JSON-LD, or city-level location only.
- **ambilet.ro**: robots.txt disallows crawling. **infomusic.ro**: 403. **Facebook events**: automated access forbidden.
