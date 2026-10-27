# Ce Facem în Timișoara?

Events and activities in Timișoara and **within 50 km**: fast, mobile-first, Romanian-first, no registration.
Only events whose **verified venue** is within 50 km (geodesic, inclusive) of 45.7489 N, 21.2087 E are ever published.
This rule is enforced in ingestion, in the database (triggers + RLS), in queries and in the API.

- Product: [PRD.md](PRD.md) · Design: [ARCHITECTURE.md](ARCHITECTURE.md) · Status: [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md)
- Sources & ingestion audit: [docs/SOURCE_AUDIT.md](docs/SOURCE_AUDIT.md)

## Online on claude.ai (same setup as Nestor.ai)

Live (private until shared): https://claude.ai/artifact/HaBkbkDVZFdAeCT9GpDutj

The page `artifact/ce-facem-timisoara.html` is built from `artifact/src/` (`page.html`, `styles.css`, `app.js`) and
embeds a snapshot of published events whose verified venue is within 50 km (re-checked by the build). To refresh it:

```bash
DEMO_DATA=off npm run ingest -- --manual && npx tsx scripts/build-artifact.ts
```

Then republish `artifact/ce-facem-timisoara.html` from the same Claude Code session (same link). Share it from the
page's **Share** menu. Viewers need to be signed in to claude.ai, and the page is not indexed by search engines.
For a fully public, search-indexed site with automatic 06:00/18:00 updates, use the Vercel + Supabase deployment below.

## Public website, no login (GitHub Pages — free)

The same page, as a public site anyone can open without an account, refreshed online at 06:00 and
18:00 by GitHub Actions (`.github/workflows/pages.yml`). Your Mac is not needed.

1. Create a free account at github.com, then a **public** repository named `ce-facem-timisoara`.
2. Push this folder:
   ```bash
   git init && git add -A && git commit -m "Ce facem în Timișoara" && git branch -M main
   ```
   ```bash
   git remote add origin https://github.com/<user>/ce-facem-timisoara.git && git push -u origin main
   ```
3. Repository → **Settings → Pages → Build and deployment → Source: GitHub Actions**.
4. **Actions → Public website (GitHub Pages) → Run workflow** (the first run takes about 15 minutes).
5. The site is at `https://<user>.github.io/ce-facem-timisoara/`.
   Optional repository variable `NOMINATIM_EMAIL` (Settings → Secrets and variables → Actions → Variables).

## Run locally (no accounts needed)

Requires Node.js 20+.

```bash
npm install
```

```bash
npm run build && npm start
```

Open http://localhost:3000. Without `DATABASE_URL` the app uses an **embedded PostGIS database** (`.data/pglite`)
with the real migrations, plus a few events clearly labelled **DEMO**. To load **real events** instead:

```bash
rm -rf .data && DEMO_DATA=off npm run ingest -- --manual
```

Admin locally: set `ADMIN_PASSWORD=...` in `.env.local`, then open `/admin`.

### Tests

```bash
npm test
```

Runs unit tests and database tests (real PostGIS via PGlite: boundary at exactly 50 km, 50.01 km rejection,
RLS, admin cannot publish invalid records, venue relocation revalidation, pipeline on real source snapshots).

```bash
npx playwright install webkit chromium && npm run test:e2e
```

End-to-end on an **iPhone 15 / WebKit (Safari engine)** profile and desktop Chrome.

---

## Deploy to production (always online, HTTPS)

The site runs on **Vercel** (hosting, HTTPS), **Supabase** (Postgres + PostGIS + Auth) and **GitHub Actions**
(twice-daily ingestion). All three have free tiers. Your computer is not needed once deployed.

### 1. GitHub repository
1. Create an empty private repository, e.g. `ce-facem-timisoara`.
2. Push this folder:
   ```bash
   git init && git add -A && git commit -m "Initial MVP" && git branch -M main
   ```
   ```bash
   git remote add origin https://github.com/<you>/ce-facem-timisoara.git && git push -u origin main
   ```

### 2. Supabase (database, PostGIS, auth)
1. Create a project at supabase.com (region: **Frankfurt / eu-central-1**). Use a **new** project (this app does not share anything with other projects).
2. **Database → Extensions**: enable `postgis`.
3. **SQL Editor**: run the files in `supabase/migrations/` **in order** (`…01_schema`, `…02_geofence`, `…03_rls`, `…04_seed`).
   Or with the Supabase CLI: `supabase link --project-ref <ref>` then `supabase db push`.
4. **Project Settings → Database → Connection string → Transaction pooler** (port 6543): this is `DATABASE_URL`.
5. **Authentication → Users → Add user**: create your admin user (email + strong password). Disable public sign-ups
   (**Authentication → Providers → Email → disable "Allow new users to sign up"**).
6. **SQL Editor**: grant admin rights to that user:
   ```sql
   insert into admin_users (user_id, email)
   select id, email from auth.users where email = 'your-admin-email@example.com';
   ```
7. **Project Settings → API**: copy the Project URL (`NEXT_PUBLIC_SUPABASE_URL`) and the `anon` key (`NEXT_PUBLIC_SUPABASE_ANON_KEY`).
   The `service_role` key is **not** needed by this app.

### 3. Vercel (website)
1. vercel.com → **Add New → Project** → import the GitHub repo (framework: Next.js, defaults are fine).
2. **Settings → Environment Variables** (Production):

   | Variable | Value |
   |---|---|
   | `NEXT_PUBLIC_SITE_URL` | `https://<your-project>.vercel.app` (or your domain) |
   | `DATABASE_URL` | Supabase transaction pooler URL |
   | `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon key |
   | `ANTHROPIC_API_KEY` | optional, for AI classification |
   | `AI_MODEL` | `claude-sonnet-5-5` (default) |
   | `CRON_SECRET` | long random string (for `/api/cron/ingest`) |
   | `NOMINATIM_EMAIL` | a contact email for the geocoder (OSM policy) |

3. Deploy. The public link is `https://<your-project>.vercel.app` — shareable, HTTPS, no login.

### 4. Scheduled ingestion (06:00 and 18:00, Europe/Bucharest)
GitHub repo → **Settings → Secrets and variables → Actions**:
- Secrets: `DATABASE_URL`, `ANTHROPIC_API_KEY` (optional)
- Variables: `NEXT_PUBLIC_SITE_URL`, `NOMINATIM_EMAIL`, `AI_MODEL` (optional)

The workflow `.github/workflows/ingest.yml` runs at 03, 04, 15 and 16 UTC; the script only acts in the
06:00/18:00 Bucharest windows (summer and winter time) and each slot runs once (idempotent).
Run it immediately: **Actions → Ingest events → Run workflow** (fills the production database the first time).

Optional: let the admin "Start ingestion" button dispatch this workflow by adding Vercel env vars
`GITHUB_DISPATCH_TOKEN` (fine-grained token with *Actions: write* on this repo) and `GITHUB_REPOSITORY=<you>/ce-facem-timisoara`.

### 5. AI provider
Create an API key at console.anthropic.com and set `ANTHROPIC_API_KEY` in Vercel **and** in the GitHub secret.
Keys are only used server-side. Without a key, a deterministic rules classifier is used.

### 6. Geocoding
Default: OpenStreetMap Nominatim, max 1 request/second, results cached in `geocoding_cache`. Set `NOMINATIM_EMAIL`.
For higher volume, point `NOMINATIM_URL` to a self-hosted or commercial Nominatim-compatible endpoint.
Venues verified by an admin or in the venue registry are never re-geocoded.

### 7. Custom domain
Vercel → Project → **Settings → Domains** → add e.g. `cefacemtimisoara.ro`, then set the DNS records Vercel shows
at your registrar. HTTPS certificates are automatic. Update `NEXT_PUBLIC_SITE_URL` and redeploy.

### 8. Security checklist
- [ ] Supabase sign-ups disabled; only users in `admin_users` are admins.
- [ ] RLS is enabled on all tables (migration `…03_rls.sql`); verify in **Database → Tables**.
- [ ] No `service_role` key anywhere in Vercel/GitHub.
- [ ] `CRON_SECRET` set (otherwise `/api/cron/ingest` refuses all calls).
- [ ] Strong admin password; enable MFA in Supabase Auth if available on your plan.
- [ ] `ADMIN_PASSWORD` **not** set in production (only for local mode).

---

## Operating
- **Admin**: `/admin` → review queue, publish/reject (publishing outside 50 km is blocked by the database),
  fix venue coordinates (distance recomputed, events re-validated), edit texts/ages, sources, runs, errors,
  submissions, duplicates.
- **Change the radius** (can only be lowered):
  `update app_config set value = jsonb_set(value, '{max_meters}', '40000') where key = 'geofence';`
- **Add a source**: insert a row in `sources` (adapter `ical`, `tribe` or `jsonld` with its config) after checking
  robots.txt and terms; or add it to `src/ingestion/sources.ts` and run `npx tsx scripts/gen-seed-sql.ts`.
