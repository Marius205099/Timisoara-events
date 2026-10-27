import type { AgeGroupId, CategoryId } from "@/lib/taxonomy";
import type { EventStatus } from "@/lib/types";
import type { Db } from "./db";

/**
 * Admin operations. Every write runs inside `db.tx(..., { asUser })`, i.e. with
 * the admin's identity under Row Level Security, and is still bound by the
 * geofence triggers — an admin cannot publish an invalid record by accident.
 */

export class GeofenceViolation extends Error {}

function friendly(e: unknown): never {
  const msg = (e as Error).message ?? String(e);
  if (msg.includes("GEOFENCE_VIOLATION"))
    throw new GeofenceViolation("Nu se poate publica: locația nu este verificată în raza de 50 km față de centrul Timișoarei.");
  if (msg.includes("row-level security") || msg.includes("permission denied")) throw new Error("Acces interzis (nu sunteți administrator).");
  throw e instanceof Error ? e : new Error(msg);
}

export interface AdminEventRow {
  id: string;
  slug: string;
  title: string;
  status: EventStatus;
  kind: string;
  review_reason: string | null;
  is_demo: boolean;
  admin_locked: boolean;
  venue_id: string | null;
  venue_name: string | null;
  locality: string | null;
  distance_km: string | null;
  geo_status: string | null;
  geo_source: string | null;
  lat: number | null;
  lng: number | null;
  first_start: string | Date | null;
  sources: string[] | null;
  updated_at: string | Date;
}

export async function adminListEvents(db: Db, f: { status?: string; q?: string; limit?: number } = {}): Promise<AdminEventRow[]> {
  const params: unknown[] = [];
  const where: string[] = [];
  if (f.status && f.status !== "all") {
    params.push(f.status);
    where.push(`e.status = $${params.length}`);
  }
  if (f.q) {
    params.push(`%${f.q}%`);
    where.push(`(e.title ilike $${params.length} or v.name ilike $${params.length})`);
  }
  params.push(f.limit ?? 200);
  return db.query<AdminEventRow>(
    `select e.id, e.slug, e.title, e.status, e.kind, e.review_reason, e.is_demo, e.admin_locked, e.updated_at,
            v.id venue_id, v.name venue_name, v.locality, v.distance_km::text, v.geo_status, v.geo_source,
            st_y(v.location::geometry) lat, st_x(v.location::geometry) lng,
            (select min(starts_at) from event_sessions s where s.event_id = e.id) first_start,
            (select array_agg(distinct source_id) from event_sources es where es.event_id = e.id) sources
       from events e left join venues v on v.id = e.venue_id
      ${where.length ? "where " + where.join(" and ") : ""}
      order by case e.status when 'needs_review' then 0 when 'published' then 1 else 2 end, first_start nulls last
      limit $${params.length}`,
    params,
  );
}

export async function adminGetEvent(db: Db, id: string) {
  const [event] = await db.query<Record<string, unknown>>(
    `select e.*, v.name venue_name, v.address venue_address, v.locality, v.distance_km::text, v.geo_status, v.geo_source, v.geo_confidence::text,
            v.geo_uncertainty_m, st_y(v.location::geometry) lat, st_x(v.location::geometry) lng, o.name organizer_name, o.address organizer_address
       from events e left join venues v on v.id = e.venue_id left join organizers o on o.id = e.organizer_id where e.id = $1`,
    [id],
  );
  if (!event) return null;
  const [sessions, sources, reviews, categories, ages] = await Promise.all([
    db.query(`select * from event_sessions where event_id = $1 order by starts_at`, [id]),
    db.query(`select es.*, s.name source_name from event_sources es join sources s on s.id = es.source_id where event_id = $1`, [id]),
    db.query(`select * from admin_reviews where event_id = $1 order by created_at desc limit 50`, [id]),
    db.query<{ category_id: CategoryId }>(`select category_id from event_categories where event_id = $1`, [id]),
    db.query<{ age_group_id: AgeGroupId; source: string }>(`select age_group_id, source from event_age_groups where event_id = $1`, [id]),
  ]);
  return { event, sessions, sources, reviews, categories: categories.map((c) => c.category_id), ageGroups: ages.map((a) => a.age_group_id) };
}

export async function adminSetStatus(db: Db, adminId: string, id: string, status: EventStatus, reason?: string) {
  try {
    await db.tx(
      async (t) => {
        await t.query(`update events set status = $2, review_reason = case when $2 = 'published' then null else coalesce($3, review_reason) end where id = $1`, [id, status, reason ?? null]);
        await t.query(`insert into admin_reviews (event_id, action, reason, admin_id) values ($1, $2, $3, $4)`, [id, status, reason ?? null, adminId]);
      },
      { asUser: adminId },
    );
  } catch (e) {
    friendly(e);
  }
}

export interface AdminEventPatch {
  title?: string;
  summary?: string;
  description?: string | null;
  officialMinAge?: number | null;
  officialMaxAge?: number | null;
  isFree?: boolean | null;
  priceMin?: number | null;
  priceMax?: number | null;
  ticketUrl?: string | null;
  accessibility?: string | null;
  indoorOutdoor?: string;
  allAges?: boolean;
  familyFriendly?: boolean;
  uncertaintyNote?: string | null;
  categories?: CategoryId[];
  ageGroups?: AgeGroupId[];
}

export async function adminUpdateEvent(db: Db, adminId: string, id: string, p: AdminEventPatch) {
  try {
    await db.tx(
      async (t) => {
        await t.query(
          `update events set title = coalesce($2, title), summary = coalesce($3, summary), description = $4,
                  official_min_age = $5, official_max_age = $6, is_free = $7, price_min = $8, price_max = $9, ticket_url = $10,
                  accessibility = $11, indoor_outdoor = coalesce($12, indoor_outdoor), all_ages = coalesce($13, all_ages),
                  family_friendly = coalesce($14, family_friendly), uncertainty_note = $15, admin_locked = true
            where id = $1`,
          [id, p.title ?? null, p.summary ?? null, p.description ?? null, p.officialMinAge ?? null, p.officialMaxAge ?? null, p.isFree ?? null,
           p.priceMin ?? null, p.priceMax ?? null, p.ticketUrl ?? null, p.accessibility ?? null, p.indoorOutdoor ?? null, p.allAges ?? null,
           p.familyFriendly ?? null, p.uncertaintyNote ?? null],
        );
        if (p.categories) {
          await t.query(`delete from event_categories where event_id = $1`, [id]);
          for (const c of p.categories) await t.query(`insert into event_categories values ($1, $2)`, [id, c]);
        }
        if (p.ageGroups) {
          await t.query(`delete from event_age_groups where event_id = $1`, [id]);
          for (const g of p.ageGroups) await t.query(`insert into event_age_groups (event_id, age_group_id, source) values ($1, $2, 'admin')`, [id, g]);
        }
        await t.query(`insert into admin_reviews (event_id, action, admin_id, details) values ($1, 'edit', $2, $3::jsonb)`, [id, adminId, JSON.stringify(p)]);
      },
      { asUser: adminId },
    );
  } catch (e) {
    friendly(e);
  }
}

/** Corrects a venue's coordinates; the DB recomputes the distance and re-validates every event there. */
export async function adminRelocateVenue(db: Db, adminId: string, venueId: string, lat: number, lng: number) {
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) throw new Error("Coordonate invalide.");
  try {
    return await db.tx(
      async (t) => {
        const [v] = await t.query<{ distance_km: string; geo_status: string }>(
          `select distance_km::text, geo_status from set_venue_location($1, $2, $3, 'admin', 1, $4)`,
          [venueId, lat, lng, adminId],
        );
        return v;
      },
      { asUser: adminId },
    );
  } catch (e) {
    friendly(e);
  }
}

export async function adminMergeDuplicate(db: Db, adminId: string, keepId: string, dropId: string) {
  await db.tx(
    async (t) => {
      await t.query(`update event_sources set event_id = $1 where event_id = $2`, [keepId, dropId]);
      await t.query(
        `insert into event_sessions (event_id, starts_at, ends_at, all_day, status)
         select $1, starts_at, ends_at, all_day, status from event_sessions where event_id = $2 on conflict do nothing`,
        [keepId, dropId],
      );
      await t.query(`update events set status = 'archived', review_reason = 'Duplicat consolidat' where id = $1`, [dropId]);
      await t.query(`update duplicate_pairs set status = 'merged' where (event_a = $1 and event_b = $2) or (event_a = $2 and event_b = $1)`, [keepId, dropId]);
      await t.query(`insert into admin_reviews (event_id, action, admin_id, details) values ($1, 'merge', $2, $3::jsonb)`, [keepId, adminId, JSON.stringify({ merged: dropId })]);
    },
    { asUser: adminId },
  );
}

/** Rules-based duplicate suggestions among upcoming events (same venue ±250 m, ±45 min). */
export async function adminDuplicateSuggestions(db: Db) {
  return db.query<{ a_id: string; a_title: string; b_id: string; b_title: string; starts_at: string; venue: string }>(
    `select distinct on (least(e1.id, e2.id), greatest(e1.id, e2.id))
            e1.id a_id, e1.title a_title, e2.id b_id, e2.title b_title, s1.starts_at, v1.name venue
       from event_sessions s1 join events e1 on e1.id = s1.event_id join venues v1 on v1.id = e1.venue_id
       join event_sessions s2 on s2.starts_at between s1.starts_at - interval '45 minutes' and s1.starts_at + interval '45 minutes'
       join events e2 on e2.id = s2.event_id and e2.id > e1.id join venues v2 on v2.id = e2.venue_id
      where e1.status not in ('archived','rejected') and e2.status not in ('archived','rejected')
        and s1.starts_at > now() - interval '1 day'
        and st_dwithin(v1.location, v2.location, 250)
      limit 100`,
  );
}

export async function adminStats(db: Db) {
  const [counts] = await db.query<Record<string, number>>(
    `select count(*) filter (where status = 'published')::int published,
            count(*) filter (where status = 'needs_review')::int needs_review,
            count(*) filter (where status = 'rejected')::int rejected,
            count(*) filter (where status = 'canceled')::int canceled,
            count(*) filter (where status = 'archived')::int archived,
            count(*) filter (where review_reason = 'out_of_radius')::int out_of_radius,
            count(*)::int total
       from events`,
  );
  const bySource = await db.query<{ id: string; name: string; enabled: boolean; auto_publish: boolean; last_run_at: string | null; last_status: string | null; events: number; access_notes: string | null; adapter: string }>(
    `select s.id, s.name, s.enabled, s.auto_publish, s.last_run_at, s.last_status, s.access_notes, s.adapter,
            (select count(distinct event_id)::int from event_sources es where es.source_id = s.id) events
       from sources s order by s.id`,
  );
  const [subs] = await db.query<{ pending: number }>(`select count(*)::int pending from event_submissions where status = 'pending'`);
  const [errs] = await db.query<{ open: number }>(`select count(*)::int open from ingestion_errors where not resolved`);
  return { counts, bySource, pendingSubmissions: subs.pending, openErrors: errs.open };
}

export async function adminListRuns(db: Db, limit = 50) {
  return db.query(`select * from source_runs order by started_at desc limit $1`, [limit]);
}

export async function adminListErrors(db: Db, limit = 100) {
  return db.query(`select * from ingestion_errors order by created_at desc limit $1`, [limit]);
}

export async function adminSetSourceEnabled(db: Db, adminId: string, sourceId: string, enabled: boolean, autoPublish?: boolean) {
  await db.tx(async (t) => {
    await t.query(`update sources set enabled = $2, auto_publish = coalesce($3, auto_publish) where id = $1`, [sourceId, enabled, autoPublish ?? null]);
  }, { asUser: adminId });
}

export async function adminListSubmissions(db: Db, status = "pending") {
  return db.query(`select * from event_submissions where status = $1 order by created_at desc limit 200`, [status]);
}

export async function isAdmin(db: Db, userId: string): Promise<boolean> {
  const [r] = await db.query(`select 1 from admin_users where user_id = $1`, [userId]);
  return Boolean(r);
}
