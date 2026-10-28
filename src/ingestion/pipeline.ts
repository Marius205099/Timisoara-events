import crypto from "node:crypto";
import { DateTime } from "luxon";
import { parseOfficialAge } from "@/lib/age";
import { isLikelyDuplicate, slugify } from "@/lib/dedupe";
import type { EventStatus } from "@/lib/types";
import type { Db } from "@/data/db";
import { ADAPTERS } from "./adapters";
import { enrich, type Enrichment } from "./enrich";
import { NominatimGeocoder, type GeocodeCache, type GeocodeResult, type Geocoder } from "./geocode";
import { politeFetch } from "./http";
import type { KnownVenue } from "./known-venues";
import { verifyVenueLocation, type LocationVerdict } from "./locate";
import type { RawEvent } from "./types";

export interface SourceRow {
  id: string;
  name: string;
  adapter: string;
  config: Record<string, unknown>;
  enabled: boolean;
  auto_publish: boolean;
}

export interface ProcessContext {
  db: Db;
  source: SourceRow;
  geocoder: Geocoder;
  knownVenues: KnownVenue[];
  runId?: string | null;
  now?: Date;
  enrichFn?: (e: RawEvent, minAge: number | null) => Promise<Enrichment>;
  /** Force a status decision (admin manual entry). Still subject to the DB geofence trigger. */
  requestedStatus?: EventStatus;
}

export interface ProcessResult {
  eventId: string | null;
  action: "inserted" | "updated" | "merged" | "skipped";
  status: EventStatus | null;
  reason: string;
  distanceKm: number | null;
}

// ---------------------------------------------------------------------------
// DB-backed helpers
// ---------------------------------------------------------------------------
export function dbGeocodeCache(db: Db): GeocodeCache {
  return {
    async get(key) {
      const [r] = await db.query<{ result: GeocodeResult | null }>(`select result from geocoding_cache where query_key = $1`, [key]);
      return r ? r.result : undefined;
    },
    async set(key, provider, value) {
      await db.query(
        `insert into geocoding_cache (query_key, provider, result) values ($1, $2, $3::jsonb)
         on conflict (query_key) do update set result = excluded.result, created_at = now()`,
        [key, provider, value === null ? null : JSON.stringify(value)],
      );
    },
  };
}

/** Venues an admin (or the registry) verified — they take precedence over geocoding. */
export async function loadKnownVenues(db: Db): Promise<KnownVenue[]> {
  const rows = await db.query<{ id: string; name: string; address: string | null; locality: string; lat: number; lng: number }>(
    `select id, name, address, locality, st_y(location::geometry) lat, st_x(location::geometry) lng
       from venues where geo_status = 'verified' and geo_source in ('admin','known_venue') and location is not null`,
  );
  return rows.map((r) => ({ key: r.id, name: r.name, address: r.address ?? "", locality: r.locality, lat: r.lat, lng: r.lng, aliases: [r.name] }));
}

async function upsertVenue(db: Db, v: LocationVerdict): Promise<string> {
  const venue = v.venue;
  const locality = venue.locality || "necunoscut";
  const [existing] = await db.query<{ id: string; geo_status: string; geo_source: string | null }>(
    `select id, geo_status, geo_source from venues where name_norm = lower(unaccent_ro($1)) and locality = $2`,
    [venue.name, locality],
  );
  const point = venue.lat != null && venue.lng != null ? [venue.lng, venue.lat] : null;

  if (existing) {
    // Admin- or registry-verified locations are authoritative; ingestion never moves them.
    if (existing.geo_source === "admin" || existing.geo_source === "known_venue") return existing.id;
    if (point && v.decision === "verified") {
      await db.query(`select set_venue_location($1, $2, $3, $4, $5)`, [existing.id, venue.lat, venue.lng, venue.geoSource, venue.geoConfidence]);
    } else if (point) {
      await db.query(
        `update venues set location = st_setsrid(st_makepoint($2, $3), 4326)::geography, geo_status = 'unverified',
                geo_source = $4, geo_confidence = $5, geo_uncertainty_m = $6 where id = $1`,
        [existing.id, point[0], point[1], venue.geoSource, venue.geoConfidence, venue.uncertaintyMeters],
      );
    }
    return existing.id;
  }

  const [row] = await db.query<{ id: string }>(
    `insert into venues (name, name_norm, address, locality, location, geo_status, geo_source, geo_confidence, geo_uncertainty_m, verified_at)
     values ($1, '', $2, $3, case when $4::float8 is null then null else st_setsrid(st_makepoint($4, $5), 4326)::geography end,
             $6, $7, $8, $9, case when $6 = 'verified' then now() end)
     returning id`,
    [venue.name, venue.address, locality, point?.[0] ?? null, point?.[1] ?? null, v.decision === "verified" ? "verified" : "unverified",
     venue.geoSource, venue.geoConfidence, venue.uncertaintyMeters],
  );
  return row.id;
}

async function upsertOrganizer(db: Db, name: string | null | undefined, address?: string | null): Promise<string | null> {
  if (!name) return null;
  const [row] = await db.query<{ id: string }>(
    `insert into organizers (name, name_norm, address) values ($1, lower(unaccent_ro($1)), $2)
     on conflict (name_norm) do update set name = excluded.name returning id`,
    [name, address ?? null],
  );
  return row.id;
}

async function uniqueSlug(db: Db, title: string, firstStart: string | undefined, excludeId?: string): Promise<string> {
  const date = firstStart ? DateTime.fromISO(firstStart).toFormat("yyyy-LL-dd") : "";
  const base = [slugify(title) || "eveniment", date].filter(Boolean).join("-");
  for (let i = 0; i < 50; i++) {
    const slug = i ? `${base}-${i + 1}` : base;
    const [hit] = await db.query<{ id: string }>(`select id from events where slug = $1`, [slug]);
    if (!hit || hit.id === excludeId) return slug;
  }
  return `${base}-${crypto.randomUUID().slice(0, 8)}`;
}

function hashRaw(e: RawEvent): string {
  return crypto.createHash("sha256").update(JSON.stringify({ ...e, description: e.description ?? "" })).digest("hex").slice(0, 32);
}

// ---------------------------------------------------------------------------
// Validation & decision
// ---------------------------------------------------------------------------
export function validateSessions(e: RawEvent, now: Date): { ok: boolean; reason?: string; sessions: RawEvent["sessions"] } {
  if (e.kind === "evergreen") return { ok: true, sessions: [] };
  const valid = e.sessions.filter((s) => {
    const st = DateTime.fromISO(s.startsAt, { setZone: true });
    const en = s.endsAt ? DateTime.fromISO(s.endsAt, { setZone: true }) : null;
    return st.isValid && (!en || (en.isValid && en >= st));
  });
  if (!valid.length) return { ok: false, reason: "invalid_dates", sessions: [] };
  const upcoming = valid.filter((s) => DateTime.fromISO(s.endsAt ?? s.startsAt, { setZone: true }).toJSDate() >= new Date(now.getTime() - 86400_000));
  if (!upcoming.length) return { ok: false, reason: "past_event", sessions: valid };
  return { ok: true, sessions: valid };
}

export function decideStatus(args: {
  location: LocationVerdict;
  datesOk: boolean;
  autoPublish: boolean;
  sourceStatus: RawEvent["status"];
  requested?: EventStatus;
}): { status: EventStatus; reason: string } {
  const { location, datesOk, autoPublish, sourceStatus, requested } = args;
  if (location.decision === "reject") return { status: "rejected", reason: location.reason };
  if (location.decision === "review") return { status: "needs_review", reason: location.reason };
  if (!datesOk) return { status: "needs_review", reason: "invalid_dates" };
  if (requested) return { status: requested, reason: "admin" };
  if (sourceStatus === "canceled") return { status: "canceled", reason: "canceled_by_source" };
  if (sourceStatus === "postponed") return { status: "needs_review", reason: "postponed_by_source" };
  return autoPublish ? { status: "published", reason: "auto_published" } : { status: "needs_review", reason: "moderation_required" };
}

// ---------------------------------------------------------------------------
// Process one raw event
// ---------------------------------------------------------------------------
export async function processRawEvent(raw: RawEvent, ctx: ProcessContext): Promise<ProcessResult> {
  const { db, source } = ctx;
  const now = ctx.now ?? new Date();

  const dates = validateSessions(raw, now);
  if (!dates.ok && dates.reason === "past_event") return { eventId: null, action: "skipped", status: null, reason: "past_event", distanceKm: null };

  const location = await verifyVenueLocation(raw.venue, raw.attendanceMode, { geocoder: ctx.geocoder, knownVenues: ctx.knownVenues });
  const official = parseOfficialAge(raw.officialAgeText);
  const decision = decideStatus({
    location, datesOk: dates.ok, autoPublish: source.auto_publish, sourceStatus: raw.status, requested: ctx.requestedStatus,
  });

  return db.tx(async (t) => {
    const venueId = await upsertVenue(t, location);
    const organizerId = await upsertOrganizer(t, raw.organizer?.name, raw.organizer?.address);

    const [ref] = await t.query<{ event_id: string; content_hash: string | null }>(
      `select event_id, content_hash from event_sources where source_id = $1 and external_id = $2`,
      [source.id, raw.externalId],
    );
    let existing = ref
      ? (await t.query<{ id: string; status: EventStatus; admin_locked: boolean; venue_id: string | null }>(
          `select id, status, admin_locked, venue_id from events where id = $1`, [ref.event_id]))[0]
      : undefined;

    // Cross-source duplicate detection (same place, ±45 min, similar title) for new records.
    let merged = false;
    if (!existing && dates.sessions[0] && location.venue.lat != null) {
      const candidates = await t.query<{ id: string; title: string; starts_at: string | Date; lat: number | null; lng: number | null; status: EventStatus; admin_locked: boolean; venue_id: string | null }>(
        `select e.id, e.title, s.starts_at, st_y(v.location::geometry) lat, st_x(v.location::geometry) lng, e.status, e.admin_locked, e.venue_id
           from event_sessions s join events e on e.id = s.event_id left join venues v on v.id = e.venue_id
          where s.starts_at between $1::timestamptz - interval '45 minutes' and $1::timestamptz + interval '45 minutes'
            and e.status not in ('rejected','archived')`,
        [dates.sessions[0].startsAt],
      );
      for (const c of candidates) {
        const r = isLikelyDuplicate(
          { title: raw.title, startsAt: dates.sessions[0].startsAt, venue: { lat: location.venue.lat, lng: location.venue.lng!, name: location.venue.name } },
          { title: c.title, startsAt: new Date(c.starts_at).toISOString(), venue: { lat: c.lat ?? undefined, lng: c.lng ?? undefined } },
          { sameSlotIsEnough: Boolean(source.config?.secondary) && location.decision === "verified" },
        );
        if (r.duplicate) {
          existing = c;
          merged = true;
          break;
        }
      }
    }

    // Unchanged content from the same source: just mark as seen.
    const contentHash = hashRaw(raw);
    if (existing && ref && ref.content_hash === contentHash && existing.venue_id === venueId) {
      await t.query(`update event_sources set last_seen_at = now() where source_id = $1 and external_id = $2`, [source.id, raw.externalId]);
      await t.query(`update events set last_verified_at = now() where id = $1`, [existing.id]);
      return { eventId: existing.id, action: "skipped", status: existing.status, reason: "unchanged", distanceKm: location.venue.distanceKm };
    }

    let status = decision.status;
    if (existing && (existing.status === "rejected" || existing.status === "archived") && decision.reason !== "out_of_radius") {
      status = existing.status; // admin decisions stick
    }

    const enrichment = existing?.admin_locked || merged ? null : await (ctx.enrichFn ?? enrich)(raw, official.min);
    const reviewReason = status === "published" ? null : decision.reason;
    let eventId: string;
    let action: ProcessResult["action"];

    if (!existing) {
      const slug = await uniqueSlug(t, raw.title, dates.sessions[0]?.startsAt);
      const [row] = await t.query<{ id: string }>(
        `insert into events (slug, kind, status, title, summary, description, image_url, organizer_id, venue_id, attendance_mode,
            indoor_outdoor, official_min_age, official_max_age, all_ages, family_friendly, is_free, price_min, price_max, currency,
            ticket_url, uncertainty_note, review_reason, ai_confidence, ai_evidence, primary_source_id, last_verified_at)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24::jsonb,$25, now())
         returning id`,
        [slug, raw.kind, status, raw.title, enrichment!.summary, raw.description ?? null, raw.imageUrl ?? null, organizerId, venueId,
         raw.attendanceMode ?? "offline", enrichment!.indoorOutdoor, official.min, official.max, enrichment!.allAges, enrichment!.familyFriendly,
         raw.isFree ?? null, raw.priceMin ?? null, raw.priceMax ?? null, raw.currency ?? null, raw.ticketUrl ?? null,
         [raw.notice, enrichment!.method === "ai" ? enrichment!.uncertainties.join(" ") : null].filter(Boolean).join(" ") || null, reviewReason,
         enrichment!.confidence, JSON.stringify({ method: enrichment!.method, evidence: enrichment!.evidence, location: location.detail ?? null }),
         source.id],
      );
      eventId = row.id;
      action = "inserted";
    } else {
      eventId = existing.id;
      action = merged ? "merged" : "updated";
      if (!merged) {
        await t.query(
          `update events set status = $2, venue_id = $3, attendance_mode = $4, official_min_age = $5, official_max_age = $6,
                  is_free = coalesce($7, is_free), price_min = coalesce($8, price_min), price_max = coalesce($9, price_max),
                  currency = coalesce($10, currency), ticket_url = coalesce($11, ticket_url), review_reason = $12, last_verified_at = now(),
                  uncertainty_note = case when admin_locked then uncertainty_note else coalesce($13, uncertainty_note) end
            where id = $1`,
          [eventId, status, venueId, raw.attendanceMode ?? "offline", official.min, official.max, raw.isFree ?? null, raw.priceMin ?? null,
           raw.priceMax ?? null, raw.currency ?? null, raw.ticketUrl ?? null, reviewReason, raw.notice ?? null],
        );
        if (enrichment) {
          await t.query(
            `update events set title = $2, summary = $3, description = $4, image_url = coalesce($5, image_url), indoor_outdoor = $6,
                    all_ages = $7, family_friendly = $8, ai_confidence = $9, ai_evidence = $10::jsonb where id = $1`,
            [eventId, raw.title, enrichment.summary, raw.description ?? null, raw.imageUrl ?? null, enrichment.indoorOutdoor,
             enrichment.allAges, enrichment.familyFriendly, enrichment.confidence,
             JSON.stringify({ method: enrichment.method, evidence: enrichment.evidence, location: location.detail ?? null })],
          );
        }
      } else {
        await t.query(`update events set last_verified_at = now() where id = $1`, [eventId]);
        await t.query(
          `insert into admin_reviews (event_id, action, reason, details) values ($1, 'auto_merge', 'duplicate consolidated', $2::jsonb)`,
          [eventId, JSON.stringify({ source: source.id, external_id: raw.externalId, title: raw.title })],
        );
      }
    }

    // Sessions: the source's dates replace those it published before (merged events only add).
    if (raw.kind === "scheduled") {
      if (!merged) await t.query(`delete from event_sessions where event_id = $1`, [eventId]);
      for (const s of dates.sessions) {
        const sessionStatus = raw.status === "canceled" ? "canceled" : raw.status === "postponed" ? "postponed" : "scheduled";
        await t.query(
          `insert into event_sessions (event_id, starts_at, ends_at, all_day, status) values ($1, $2, $3, $4, $5)
           on conflict (event_id, starts_at) do update set ends_at = excluded.ends_at, status = excluded.status`,
          [eventId, s.startsAt, s.endsAt ?? null, Boolean(s.allDay), sessionStatus],
        );
      }
    }

    if (enrichment) {
      await t.query(`delete from event_categories where event_id = $1`, [eventId]);
      for (const c of enrichment.categories)
        await t.query(`insert into event_categories (event_id, category_id) values ($1, $2) on conflict do nothing`, [eventId, c]);
      await t.query(`delete from event_age_groups where event_id = $1 and source <> 'admin'`, [eventId]);
      for (const g of enrichment.recommendedAgeGroups)
        await t.query(
          `insert into event_age_groups (event_id, age_group_id, source, confidence) values ($1, $2, $3, $4) on conflict do nothing`,
          [eventId, g, enrichment.method, enrichment.confidence],
        );
    }

    await t.query(
      `insert into event_sources (event_id, source_id, external_id, url, raw, content_hash) values ($1, $2, $3, $4, $5::jsonb, $6)
       on conflict (source_id, external_id) do update set event_id = excluded.event_id, url = excluded.url, raw = excluded.raw,
              content_hash = excluded.content_hash, last_seen_at = now()`,
      [eventId, source.id, raw.externalId, raw.url || "", JSON.stringify(raw), contentHash],
    );

    if (status !== "published" && action !== "merged") {
      await t.query(`insert into admin_reviews (event_id, action, reason, details) values ($1, $2, $3, $4::jsonb)`, [
        eventId, `auto_${status}`, decision.reason,
        JSON.stringify({ distance_km: location.venue.distanceKm, location: location.detail ?? null, source: source.id }),
      ]);
    }
    return { eventId, action, status, reason: decision.reason, distanceKm: location.venue.distanceKm };
  });
}

// ---------------------------------------------------------------------------
// Runs
// ---------------------------------------------------------------------------
export interface RunStats {
  fetched: number;
  inserted: number;
  updated: number;
  merged: number;
  skipped: number;
  published: number;
  needsReview: number;
  rejected: number;
  outOfRadius: number;
  errors: number;
}

const emptyStats = (): RunStats => ({ fetched: 0, inserted: 0, updated: 0, merged: 0, skipped: 0, published: 0, needsReview: 0, rejected: 0, outOfRadius: 0, errors: 0 });

export async function logIngestionError(db: Db, e: { runId?: string | null; sourceId?: string; stage: string; message: string; payload?: unknown }) {
  await db.query(`insert into ingestion_errors (run_id, source_id, stage, message, payload) values ($1, $2, $3, $4, $5::jsonb)`, [
    e.runId ?? null, e.sourceId ?? null, e.stage, e.message.slice(0, 2000), e.payload === undefined ? null : JSON.stringify(e.payload),
  ]);
}

export async function runSource(
  db: Db,
  source: SourceRow,
  opts: { slotKey: string; trigger: "schedule" | "manual"; fetchText?: (url: string, accept?: string) => Promise<string>; geocoder?: Geocoder; now?: Date; enrichFn?: ProcessContext["enrichFn"] },
): Promise<{ status: "succeeded" | "failed" | "skipped"; stats: RunStats; runId: string | null }> {
  const adapter = ADAPTERS[source.adapter];
  if (!adapter) return { status: "skipped", stats: emptyStats(), runId: null };

  // Idempotency: one run per (source, slot). A concurrent or repeated trigger is a no-op.
  const [run] = await db.query<{ id: string }>(
    `insert into source_runs (source_id, slot_key, trigger) values ($1, $2, $3) on conflict (source_id, slot_key) do nothing returning id`,
    [source.id, opts.slotKey, opts.trigger],
  );
  if (!run) return { status: "skipped", stats: emptyStats(), runId: null };

  const stats = emptyStats();
  const now = opts.now ?? new Date();
  const fetchText = opts.fetchText ?? (async (url: string, accept?: string) => (await politeFetch(url, { accept })).text());
  const ctx: ProcessContext = {
    db, source, now, runId: run.id, enrichFn: opts.enrichFn,
    geocoder: opts.geocoder ?? new NominatimGeocoder(dbGeocodeCache(db)),
    knownVenues: await loadKnownVenues(db),
  };

  try {
    const defaultHints = (source.config.categoryHints as string[] | undefined) ?? [];
    const fetched = await adapter.fetch({ ...source.config, sourceId: source.id }, { fetchText, now, log: (m) => console.log(`[${source.id}] ${m}`) });
    // Per-source genre hints (e.g. a theatre's feed) help classification; they never affect location.
    const raws = fetched.map((r) => ({ ...r, categoryHints: [...(r.categoryHints ?? []), ...defaultHints] }));
    stats.fetched = raws.length;
    const seen: string[] = [];
    for (const raw of raws) {
      try {
        const r = await processRawEvent(raw, ctx);
        seen.push(raw.externalId);
        stats[r.action === "inserted" ? "inserted" : r.action === "updated" ? "updated" : r.action === "merged" ? "merged" : "skipped"]++;
        if (r.status === "published") stats.published++;
        else if (r.status === "needs_review") stats.needsReview++;
        else if (r.status === "rejected") stats.rejected++;
        if (r.reason === "out_of_radius") stats.outOfRadius++;
      } catch (e) {
        stats.errors++;
        await logIngestionError(db, { runId: run.id, sourceId: source.id, stage: "process", message: (e as Error).message, payload: { externalId: raw.externalId, title: raw.title, url: raw.url } });
      }
    }
    await markDisappeared(db, source.id, seen, now);
    await db.query(`update source_runs set status = 'succeeded', finished_at = now(), stats = $2::jsonb where id = $1`, [run.id, JSON.stringify(stats)]);
    await db.query(`update sources set last_run_at = now(), last_status = 'succeeded' where id = $1`, [source.id]);
    return { status: "succeeded", stats, runId: run.id };
  } catch (e) {
    const msg = (e as Error).message;
    await logIngestionError(db, { runId: run.id, sourceId: source.id, stage: "fetch", message: msg });
    await db.query(`update source_runs set status = 'failed', finished_at = now(), stats = $2::jsonb, error = $3 where id = $1`, [run.id, JSON.stringify(stats), msg]);
    await db.query(`update sources set last_run_at = now(), last_status = 'failed' where id = $1`, [source.id]);
    return { status: "failed", stats, runId: run.id };
  }
}

/**
 * Upcoming published events that a source no longer lists are sent to review
 * (the organizer may have canceled them) instead of staying online silently.
 */
async function markDisappeared(db: Db, sourceId: string, seenExternalIds: string[], now: Date) {
  if (!seenExternalIds.length) return; // empty fetch = probably a source problem, not mass cancellation
  await db.query(
    `update events e set status = 'needs_review', review_reason = 'Evenimentul nu mai apare la sursă — verificați dacă a fost anulat.'
      where e.status = 'published' and e.admin_locked = false
        and exists (select 1 from event_sources es where es.event_id = e.id and es.source_id = $1 and not (es.external_id = any($2::text[])))
        and not exists (select 1 from event_sources es2 where es2.event_id = e.id and (es2.source_id <> $1 or es2.external_id = any($2::text[])))
        and exists (select 1 from event_sessions s where s.event_id = e.id and s.starts_at > $3::timestamptz)`,
    [sourceId, seenExternalIds, now.toISOString()],
  );
}

/** Housekeeping: past scheduled events leave the public feed. */
export async function archivePastEvents(db: Db, now = new Date()): Promise<number> {
  const rows = await db.query<{ id: string }>(
    `update events e set status = 'archived'
      where e.kind = 'scheduled' and e.status in ('published','canceled','needs_review')
        and not exists (select 1 from event_sessions s where s.event_id = e.id
                         and coalesce(s.ends_at, s.starts_at) > $1::timestamptz - interval '1 day')
      returning id`,
    [now.toISOString()],
  );
  return rows.length;
}

export async function runAllSources(
  db: Db,
  opts: { slotKey: string; trigger: "schedule" | "manual"; sourceIds?: string[]; fetchText?: (url: string, accept?: string) => Promise<string>; geocoder?: Geocoder },
) {
  const sources = await db.query<SourceRow>(`select id, name, adapter, config, enabled, auto_publish from sources where enabled and adapter <> 'manual' order by id`);
  const results: Record<string, Awaited<ReturnType<typeof runSource>>> = {};
  for (const s of sources) {
    if (opts.sourceIds && !opts.sourceIds.includes(s.id)) continue;
    results[s.id] = await runSource(db, s, opts);
  }
  const archived = await archivePastEvents(db);
  return { results, archived };
}

