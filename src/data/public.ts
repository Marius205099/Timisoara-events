import { isPubliclyVisible } from "@/lib/filters";
import type { AgeGroupId, CategoryId } from "@/lib/taxonomy";
import type { PublicEvent } from "@/lib/types";
import type { Db } from "./db";

/** Row shape of the `public_events` view (see migrations/…_geofence.sql). */
export interface PublicEventRow {
  id: string;
  slug: string;
  kind: "scheduled" | "evergreen";
  status: PublicEvent["status"];
  title: string;
  summary: string;
  description: string | null;
  image_url: string | null;
  image_credit: string | null;
  attendance_mode: PublicEvent["attendanceMode"];
  indoor_outdoor: PublicEvent["indoorOutdoor"];
  official_min_age: number | null;
  official_max_age: number | null;
  all_ages: boolean;
  family_friendly: boolean;
  accessibility: string | null;
  is_free: boolean | null;
  price_min: string | number | null;
  price_max: string | number | null;
  currency: string | null;
  ticket_url: string | null;
  opening_hours: PublicEvent["openingHours"];
  uncertainty_note: string | null;
  ai_confidence: string | number | null;
  is_demo: boolean;
  last_verified_at: string | Date;
  organizer_name: string | null;
  venue: {
    id: string; name: string; address: string | null; locality: string; lat: number | null; lng: number | null;
    distance_km: number | string | null; geo_status: PublicEvent["venue"]["geoStatus"]; geo_source: string | null; geo_confidence: number | string | null;
  };
  sessions: { id: string; starts_at: string; ends_at: string | null; all_day: boolean; status: PublicEvent["sessions"][number]["status"] }[];
  categories: CategoryId[] | null;
  age_groups: AgeGroupId[] | null;
  sources: { source_id: string; source_name: string; url: string; external_id: string | null; last_seen_at: string }[] | null;
}

const num = (v: unknown) => (v === null || v === undefined ? null : Number(v));
const iso = (v: string | Date) => (v instanceof Date ? v.toISOString() : new Date(v).toISOString());

export function rowToPublicEvent(r: PublicEventRow): PublicEvent {
  return {
    id: r.id,
    slug: r.slug,
    kind: r.kind,
    status: r.status,
    title: r.title,
    summary: r.summary,
    description: r.description,
    imageUrl: r.image_url,
    imageCredit: r.image_credit,
    categories: r.categories ?? [],
    recommendedAgeGroups: r.age_groups ?? [],
    allAges: r.all_ages,
    familyFriendly: r.family_friendly,
    officialMinAge: r.official_min_age,
    officialMaxAge: r.official_max_age,
    accessibility: r.accessibility,
    isFree: r.is_free,
    priceMin: num(r.price_min),
    priceMax: num(r.price_max),
    currency: r.currency,
    indoorOutdoor: r.indoor_outdoor,
    attendanceMode: r.attendance_mode,
    organizer: r.organizer_name,
    ticketUrl: r.ticket_url,
    venue: {
      id: r.venue.id,
      name: r.venue.name,
      address: r.venue.address,
      locality: r.venue.locality,
      lat: num(r.venue.lat),
      lng: num(r.venue.lng),
      distanceKm: num(r.venue.distance_km),
      geoStatus: r.venue.geo_status,
      geoSource: r.venue.geo_source,
      geoConfidence: num(r.venue.geo_confidence),
    },
    sessions: (r.sessions ?? []).map((s) => ({
      id: s.id,
      startsAt: iso(s.starts_at),
      endsAt: s.ends_at ? iso(s.ends_at) : null,
      allDay: s.all_day,
      status: s.status,
    })),
    openingHours: r.opening_hours,
    sources: (r.sources ?? []).map((s) => ({
      sourceId: s.source_id,
      sourceName: s.source_name,
      url: s.url,
      externalId: s.external_id,
      lastSeenAt: iso(s.last_seen_at),
    })),
    lastVerifiedAt: iso(r.last_verified_at),
    uncertaintyNote: r.uncertainty_note,
    aiConfidence: num(r.ai_confidence),
    isDemo: r.is_demo,
  };
}

/**
 * Public queries read only the `public_events` view, which already enforces the
 * geofence in SQL; every row is checked again in application code before it
 * leaves the server (defense in depth).
 */
export async function listPublicEvents(db: Db, fromIso: string, toIso: string): Promise<PublicEvent[]> {
  const rows = await db.query<PublicEventRow>(`select * from public_events_between($1::timestamptz, $2::timestamptz)`, [fromIso, toIso]);
  return rows.map(rowToPublicEvent).filter(isPubliclyVisible);
}

export async function getPublicEventBySlug(db: Db, slug: string): Promise<PublicEvent | null> {
  const [row] = await db.query<PublicEventRow>(`select * from public_events where slug = $1`, [slug]);
  const e = row ? rowToPublicEvent(row) : null;
  return e && isPubliclyVisible(e) ? e : null;
}

export async function listPublicSlugs(db: Db): Promise<{ slug: string; updatedAt: string }[]> {
  const rows = await db.query<{ slug: string; updated_at: string | Date }>(
    `select slug, updated_at from public_events
      where kind = 'evergreen' or exists (select 1 from event_sessions s where s.event_id = public_events.id
                                           and coalesce(s.ends_at, s.starts_at) > now() - interval '1 day')
      order by updated_at desc limit 5000`,
  );
  return rows.map((r) => ({ slug: r.slug, updatedAt: iso(r.updated_at) }));
}
