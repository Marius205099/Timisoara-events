import fs from "node:fs";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import type { Db } from "@/data/db";
import { listPublicEvents } from "@/data/public";
import { processRawEvent, runSource, type SourceRow } from "@/ingestion/pipeline";
import type { RawEvent } from "@/ingestion/types";
import { destinationFromCenter } from "@/lib/geo";
import { FakeGeocoder, ORADEA, freshDb, noAi } from "./helpers";

const fx = (n: string) => fs.readFileSync(path.join(__dirname, "..", "fixtures", n), "utf8");
const NOW = new Date("2026-10-27T08:00:00Z");
const fixtureFetch = async (url: string) => {
  if (url.includes("tntm.ro/events.ics")) return fx("tntm.ics");
  if (url.includes("tribe/events")) return url.includes("page=1") ? fx("filarmonica-tribe.json") : JSON.stringify({ events: [] });
  if (url.includes("teatrulgerman.ro")) return fx("teatrul-german-program.html");
  throw new Error(`unexpected fetch ${url}`);
};

let db: Db;
let sources: Record<string, SourceRow>;
const geocoder = new FakeGeocoder({ oradea: ORADEA });

beforeAll(async () => {
  db = await freshDb();
  const rows = await db.query<SourceRow>(`select id, name, adapter, config, enabled, auto_publish from sources`);
  sources = Object.fromEntries(rows.map((r) => [r.id, r]));
});

const base = (p: Partial<RawEvent>): RawEvent => ({
  sourceId: "admin", externalId: `x-${Math.random()}`, url: "https://example.test/e", title: "Test", kind: "scheduled",
  sessions: [{ startsAt: "2026-11-07T18:00:00+02:00", endsAt: "2026-11-07T20:00:00+02:00" }], venue: {}, ...p,
});
const ctx = (sourceId = "tntm", g = geocoder) => ({ db, source: sources[sourceId], geocoder: g, knownVenues: [], now: NOW, enrichFn: noAi });

describe("ingestion pipeline on real source snapshots", () => {
  it("TNTM iCal → published events with venue GEO and official ages", async () => {
    const r = await runSource(db, sources.tntm, { slotKey: "2026-10-27T06", trigger: "schedule", fetchText: fixtureFetch, geocoder, now: NOW, enrichFn: noAi });
    expect(r.status).toBe("succeeded");
    expect(r.stats.fetched).toBe(19);
    expect(r.stats.published).toBeGreaterThan(0);
    const [e] = await db.query<{ official_min_age: number; distance_km: string; status: string }>(
      `select e.official_min_age, v.distance_km::text, e.status from events e join venues v on v.id = e.venue_id where e.title = 'UNDERGROUND FM'`,
    );
    expect(e.status).toBe("published");
    expect(e.official_min_age).toBe(16);
    expect(Number(e.distance_km)).toBeGreaterThan(1);
    expect(Number(e.distance_km)).toBeLessThan(2);
  });

  it("is idempotent per slot (a second trigger in the same slot is skipped)", async () => {
    const r = await runSource(db, sources.tntm, { slotKey: "2026-10-27T06", trigger: "schedule", fetchText: fixtureFetch, geocoder, now: NOW, enrichFn: noAi });
    expect(r.status).toBe("skipped");
  });

  it("re-running a new slot updates instead of duplicating", async () => {
    const before = await db.query(`select id from events`);
    await runSource(db, sources.tntm, { slotKey: "2026-10-27T18", trigger: "schedule", fetchText: fixtureFetch, geocoder, now: NOW, enrichFn: noAi });
    const after = await db.query(`select id from events`);
    expect(after.length).toBe(before.length);
  });

  it("Teatrul German: home shows published, Oradea touring date rejected even though the organizer is in Timișoara", async () => {
    const r = await runSource(db, sources["teatrul-german"], { slotKey: "s1", trigger: "manual", fetchText: fixtureFetch, geocoder, now: NOW, enrichFn: noAi });
    expect(r.stats.outOfRadius).toBe(1);
    const rows = await db.query<{ title: string; status: string; review_reason: string | null; locality: string }>(
      `select e.title, e.status, e.review_reason, v.locality from events e join venues v on v.id = e.venue_id
        where e.primary_source_id = 'teatrul-german'`,
    );
    const tour = rows.find((x) => x.locality === "Oradea")!;
    expect(tour.status).toBe("rejected");
    expect(tour.review_reason).toBe("out_of_radius");
    expect(rows.filter((x) => x.locality === "Timișoara").every((x) => x.status === "published")).toBe(true);
    const pub = await listPublicEvents(db, "2026-10-01T00:00:00Z", "2026-12-31T00:00:00Z");
    expect(pub.some((e) => e.venue.locality === "Oradea")).toBe(false);
  });

  it("Filarmonica: venues resolved via the verified venue registry", async () => {
    const r = await runSource(db, sources["filarmonica-banatul"], { slotKey: "s1", trigger: "manual", fetchText: fixtureFetch, geocoder, now: NOW, enrichFn: noAi });
    expect(r.status).toBe("succeeded");
    const rows = await db.query<{ title: string; status: string; venue: string }>(
      `select e.title, e.status, v.name venue from events e join venues v on v.id = e.venue_id where e.primary_source_id = 'filarmonica-banatul'`,
    );
    expect(rows.length).toBeGreaterThan(5);
    expect(rows.find((x) => x.venue.startsWith("Sala Capitol"))?.status).toBe("published");
  });

  it("unknown venue coordinates prevent automatic publishing", async () => {
    const r = await processRawEvent(base({ title: "Mystery party", venue: { name: "La Ion în curte" } }), ctx());
    expect(r.status).toBe("needs_review");
    expect(r.reason).toBe("venue_not_found");
  });

  it("low-confidence (town-level) geocoding inside the radius goes to review, not publish", async () => {
    const g = new FakeGeocoder({ giroc: { lat: 45.6935, lng: 21.2358, displayName: "Giroc, Timiș", provider: "fake", matchLevel: "locality", confidence: 0.3, uncertaintyMeters: 3000 } });
    const r = await processRawEvent(base({ title: "Something in Giroc", venue: { name: "Undeva", locality: "Giroc" } }), ctx("tntm", g));
    expect(r.status).toBe("needs_review");
    expect(r.reason).toBe("low_confidence_location");
  });

  it("organizer location never overrides the venue location", async () => {
    const far = destinationFromCenter(90, 75_000);
    const r = await processRawEvent(
      base({ title: "Touring concert", venue: { name: "Sala din alt oraș", lat: far.lat, lng: far.lng }, organizer: { name: "Filarmonica Banatul", address: "Bd. C.D. Loga 2, Timișoara" } }),
      ctx(),
    );
    expect(r.status).toBe("rejected");
    expect(r.reason).toBe("out_of_radius");
  });

  it("events inside the radius are included regardless of county (Arad county, 49 km)", async () => {
    const p = { lat: 46.1866, lng: 21.3123 }; // Arad city — different county, still within 50 km
    const r = await processRawEvent(base({ title: "Târg în Arad", venue: { name: "Piața Avram Iancu Arad", locality: "Arad", lat: p.lat, lng: p.lng } }), ctx());
    expect(r.status).toBe("published");
    expect(r.distanceKm!).toBeLessThan(50);
  });

  it("online-only events are excluded; hybrid events need a verified physical venue", async () => {
    const online = await processRawEvent(base({ title: "Webinar", attendanceMode: "online", venue: {} }), ctx());
    expect(online.status).toBe("rejected");
    const hybrid = await processRawEvent(base({ title: "Hybrid talk", attendanceMode: "hybrid", venue: { name: "Sala Capitol" } }), ctx());
    expect(hybrid.status).toBe("published");
  });

  it("changed venue triggers geographic revalidation on the next ingestion", async () => {
    const ext = "moving-event";
    const first = await processRawEvent(base({ externalId: ext, title: "Expo itinerantă", venue: { name: "Muzeul Banatului" } }), ctx());
    expect(first.status).toBe("published");
    const far = destinationFromCenter(270, 60_000);
    const second = await processRawEvent(
      base({ externalId: ext, title: "Expo itinerantă", venue: { name: "Galeria Nouă", locality: "Altundeva", lat: far.lat, lng: far.lng } }),
      ctx(),
    );
    expect(second.eventId).toBe(first.eventId);
    expect(second.status).toBe("rejected");
    const pub = await listPublicEvents(db, "2026-11-01T00:00:00Z", "2026-11-30T00:00:00Z");
    expect(pub.some((e) => e.id === first.eventId)).toBe(false);
  });

  it("duplicates across sources are consolidated into one event with two sources", async () => {
    const a = await processRawEvent(base({ externalId: "dup-a", title: "Anna Karenina", sessions: [{ startsAt: "2026-11-12T19:00:00+02:00" }], venue: { name: "Teatrul Național Timișoara" } }), ctx("tntm"));
    const b = await processRawEvent(
      base({ externalId: "dup-b", title: "Bilete Anna Karenina - Teatrul Național", sessions: [{ startsAt: "2026-11-12T19:00:00+02:00" }], venue: { name: "Teatrul National", address: "Str. Mărășești 2", lat: 45.7543, lng: 21.2261 } }),
      ctx("iabilet"),
    );
    expect(b.action).toBe("merged");
    expect(b.eventId).toBe(a.eventId);
    const refs = await db.query(`select source_id from event_sources where event_id = $1`, [a.eventId]);
    expect(refs.map((r) => (r as { source_id: string }).source_id).sort()).toEqual(["iabilet", "tntm"]);
  });

  it("canceled events are marked canceled (and stay visibly marked, not silently live)", async () => {
    const ext = "will-cancel";
    const first = await processRawEvent(base({ externalId: ext, title: "Recital de pian", venue: { name: "Sala Capitol" } }), ctx());
    expect(first.status).toBe("published");
    const second = await processRawEvent(base({ externalId: ext, title: "ANULAT: Recital de pian", status: "canceled", venue: { name: "Sala Capitol" } }), ctx());
    expect(second.status).toBe("canceled");
    const pub = await listPublicEvents(db, "2026-11-07T00:00:00+02:00", "2026-11-07T23:59:00+02:00");
    const e = pub.find((x) => x.id === first.eventId)!;
    expect(e.status).toBe("canceled");
    expect(e.sessions[0].status).toBe("canceled");
  });

  it("past events are skipped; every published event links to a genuine source URL", async () => {
    const past = await processRawEvent(base({ title: "Old", sessions: [{ startsAt: "2025-01-01T18:00:00+02:00" }], venue: { name: "Sala Capitol" } }), ctx());
    expect(past.action).toBe("skipped");
    const pub = await listPublicEvents(db, "2026-10-01T00:00:00Z", "2026-12-31T00:00:00Z");
    for (const e of pub) {
      expect(e.sources.length).toBeGreaterThan(0);
      for (const s of e.sources) expect(s.url).toMatch(/^https:\/\//);
    }
  });
});
