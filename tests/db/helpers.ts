import { createPgliteDb, type Db } from "@/data/db";
import type { GeocodeQuery, GeocodeResult, Geocoder } from "@/ingestion/geocode";
import type { Enrichment } from "@/ingestion/enrich";
import { rulesEnrich } from "@/ingestion/enrich";

export const ADMIN_ID = "11111111-1111-1111-1111-111111111111";
export const RANDOM_USER = "22222222-2222-2222-2222-222222222222";

export async function freshDb(): Promise<Db> {
  const db = await createPgliteDb(); // in-memory, all migrations applied
  await db.query(`insert into admin_users (user_id, email) values ($1, 'admin@example.test')`, [ADMIN_ID]);
  return db;
}

export async function insertVenue(db: Db, name: string, lat: number | null, lng: number | null, status: "verified" | "unverified" = "verified") {
  const [v] = await db.query<{ id: string; geo_status: string; distance_km: string }>(
    `insert into venues (name, name_norm, locality, location, geo_status, geo_source, verified_at)
     values ($1, '', 'Test', case when $2::float8 is null then null else st_setsrid(st_makepoint($3, $2), 4326)::geography end, $4, 'admin', now())
     returning id, geo_status, distance_km::text`,
    [name, lat, lng, status],
  );
  return v;
}

export async function insertEvent(db: Db, venueId: string | null, status = "needs_review", extra: Record<string, unknown> = {}) {
  const slug = `e-${Math.random().toString(36).slice(2, 9)}`;
  const [e] = await db.query<{ id: string }>(
    `insert into events (slug, title, status, venue_id, attendance_mode) values ($1, $2, $3, $4, $5) returning id`,
    [slug, (extra.title as string) ?? slug, status, venueId, (extra.attendance_mode as string) ?? "offline"],
  );
  await db.query(`insert into event_sessions (event_id, starts_at, ends_at) values ($1, $2, $3)`, [
    e.id, (extra.starts_at as string) ?? "2026-10-31T18:00:00+02:00", (extra.ends_at as string) ?? "2026-10-31T20:00:00+02:00",
  ]);
  return e.id;
}

/** Deterministic geocoder for tests: maps a locality/name to a canned result. */
export class FakeGeocoder implements Geocoder {
  calls: GeocodeQuery[] = [];
  constructor(private table: Record<string, GeocodeResult | null>) {}
  async geocode(q: GeocodeQuery) {
    this.calls.push(q);
    const keys = [q.address, q.name, q.locality].filter(Boolean).map((s) => s!.toLowerCase());
    for (const k of keys) for (const [pat, r] of Object.entries(this.table)) if (k.includes(pat)) return r;
    return null;
  }
}

export const ORADEA: GeocodeResult = { lat: 47.0549163, lng: 21.9285231, displayName: "Oradea, Bihor, România", provider: "fake", matchLevel: "locality", confidence: 0.3, uncertaintyMeters: 9000 };

export const noAi = async (e: Parameters<typeof rulesEnrich>[0], min: number | null): Promise<Enrichment> => rulesEnrich(e, min);
