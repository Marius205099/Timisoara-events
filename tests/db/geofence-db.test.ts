import { beforeAll, describe, expect, it } from "vitest";
import type { Db } from "@/data/db";
import { adminRelocateVenue, adminSetStatus, GeofenceViolation } from "@/data/admin";
import { listPublicEvents, getPublicEventBySlug } from "@/data/public";
import { destinationFromCenter } from "@/lib/geo";
import { ADMIN_ID, RANDOM_USER, freshDb, insertEvent, insertVenue } from "./helpers";

let db: Db;
beforeAll(async () => {
  db = await freshDb();
});

const WINDOW: [string, string] = ["2026-10-31T00:00:00+02:00", "2026-10-31T23:59:59+02:00"];

describe("database-level 50 km safeguard (PostGIS, spheroid)", () => {
  it("includes a venue exactly on the 50 km boundary", async () => {
    const p = destinationFromCenter(120, 50_000);
    const v = await insertVenue(db, "Boundary venue", p.lat, p.lng);
    expect(v.geo_status).toBe("verified");
    expect(Number(v.distance_km)).toBeCloseTo(50, 2);
    const id = await insertEvent(db, v.id, "published", { title: "Exactly at 50 km" });
    const pub = await listPublicEvents(db, ...WINDOW);
    expect(pub.map((e) => e.id)).toContain(id);
  });

  it("marks a venue 50.01 km away as out_of_radius and refuses to publish there", async () => {
    const p = destinationFromCenter(300, 50_010);
    const v = await insertVenue(db, "Just outside", p.lat, p.lng);
    expect(v.geo_status).toBe("out_of_radius");
    await expect(insertEvent(db, v.id, "published")).rejects.toThrow(/GEOFENCE_VIOLATION/);
  });

  it("refuses to publish with unknown venue coordinates or no venue", async () => {
    const v = await insertVenue(db, "Nowhere", null, null);
    expect(v.geo_status).toBe("unverified");
    await expect(insertEvent(db, v.id, "published")).rejects.toThrow(/GEOFENCE_VIOLATION/);
    await expect(insertEvent(db, null, "published")).rejects.toThrow(/GEOFENCE_VIOLATION/);
  });

  it("refuses to publish online-only events", async () => {
    const v = await insertVenue(db, "Center", 45.7489, 21.2087);
    await expect(insertEvent(db, v.id, "published", { attendance_mode: "online" })).rejects.toThrow(/online-only/);
  });

  it("a venue that is not explicitly verified cannot be used even inside the radius", async () => {
    const v = await insertVenue(db, "Inside but unverified", 45.75, 21.22, "unverified");
    await expect(insertEvent(db, v.id, "published")).rejects.toThrow(/GEOFENCE_VIOLATION/);
  });

  it("re-validates published events when their venue moves outside the radius", async () => {
    const v = await insertVenue(db, "Movable venue", 45.75, 21.23);
    const id = await insertEvent(db, v.id, "published", { title: "Will move" });
    expect((await listPublicEvents(db, ...WINDOW)).some((e) => e.id === id)).toBe(true);

    const far = destinationFromCenter(10, 80_000);
    await adminRelocateVenue(db, ADMIN_ID, v.id, far.lat, far.lng);

    const [e] = await db.query<{ status: string; review_reason: string }>(`select status, review_reason from events where id = $1`, [id]);
    expect(e.status).toBe("needs_review");
    expect((await listPublicEvents(db, ...WINDOW)).some((x) => x.id === id)).toBe(false);
    const [rev] = await db.query(`select * from admin_reviews where event_id = $1 and action = 'revalidate'`, [id]);
    expect(rev).toBeTruthy();
  });

  it("moving a venue without re-verifying it drops verification", async () => {
    const v = await insertVenue(db, "Silent move", 45.75, 21.23);
    const id = await insertEvent(db, v.id, "published");
    await db.query(`update venues set location = st_setsrid(st_makepoint(21.25, 45.76), 4326)::geography where id = $1`, [v.id]);
    const [vv] = await db.query<{ geo_status: string }>(`select geo_status from venues where id = $1`, [v.id]);
    expect(vv.geo_status).toBe("unverified");
    const [e] = await db.query<{ status: string }>(`select status from events where id = $1`, [id]);
    expect(e.status).toBe("needs_review");
  });

  it("cannot raise the configured radius above 50 km", async () => {
    await expect(
      db.query(`update app_config set value = jsonb_set(value, '{max_meters}', '60000') where key = 'geofence'`),
    ).rejects.toThrow(/geofence_max_cap/);
    const [{ m }] = await db.query<{ m: number }>(`select geofence_max_meters() m`);
    expect(m).toBe(50000);
  });

  it("the radius can be lowered centrally, and the public feed follows", async () => {
    const v = await insertVenue(db, "30 km venue", destinationFromCenter(200, 30_000).lat, destinationFromCenter(200, 30_000).lng);
    const id = await insertEvent(db, v.id, "published");
    await db.query(`update app_config set value = jsonb_set(value, '{max_meters}', '20000') where key = 'geofence'`);
    expect((await listPublicEvents(db, ...WINDOW)).some((e) => e.id === id)).toBe(false);
    await db.query(`update app_config set value = jsonb_set(value, '{max_meters}', '50000') where key = 'geofence'`);
    expect((await listPublicEvents(db, ...WINDOW)).some((e) => e.id === id)).toBe(true);
  });
});

describe("admin safety & RLS", () => {
  it("an admin cannot accidentally publish an invalid record", async () => {
    const p = destinationFromCenter(45, 70_000);
    const v = await insertVenue(db, "Far admin venue", p.lat, p.lng);
    const id = await insertEvent(db, v.id, "needs_review");
    await expect(adminSetStatus(db, ADMIN_ID, id, "published")).rejects.toBeInstanceOf(GeofenceViolation);
    const [e] = await db.query<{ status: string }>(`select status from events where id = $1`, [id]);
    expect(e.status).toBe("needs_review");
  });

  it("an admin can publish a valid record", async () => {
    const v = await insertVenue(db, "Valid admin venue", 45.76, 21.21);
    const id = await insertEvent(db, v.id, "needs_review");
    await adminSetStatus(db, ADMIN_ID, id, "published");
    const [e] = await db.query<{ status: string }>(`select status from events where id = $1`, [id]);
    expect(e.status).toBe("published");
  });

  it("a signed-in non-admin cannot modify events (RLS)", async () => {
    const v = await insertVenue(db, "RLS venue", 45.76, 21.21);
    const id = await insertEvent(db, v.id, "needs_review", { title: "RLS original" });
    await db.tx(async (t) => {
      await t.query(`update events set title = 'hacked' where id = $1`, [id]);
    }, { asUser: RANDOM_USER });
    const [e] = await db.query<{ title: string }>(`select title from events where id = $1`, [id]);
    expect(e.title).toBe("RLS original");
  });

  it("anonymous visitors see only geofence-valid published rows and cannot write", async () => {
    const p = destinationFromCenter(0, 70_000);
    const far = await insertVenue(db, "Anon far", p.lat, p.lng);
    const hiddenId = await insertEvent(db, far.id, "rejected");
    const rows = await db.tx(async (t) => {
      await t.query(`set local role anon`);
      return t.query<{ id: string; status: string }>(`select id, status from events`);
    });
    expect(rows.every((r) => r.status === "published" || r.status === "canceled")).toBe(true);
    expect(rows.some((r) => r.id === hiddenId)).toBe(false);
    await expect(
      db.tx(async (t) => {
        await t.query(`set local role anon`);
        await t.query(`insert into venues (name, name_norm) values ('x', 'x')`);
      }),
    ).rejects.toThrow(/permission denied|row-level security/);
    await expect(
      db.tx(async (t) => {
        await t.query(`set local role anon`);
        await t.query(`select * from event_submissions`);
      }),
    ).rejects.toThrow(/permission denied/);
  });

  it("detail page lookups never return hidden records", async () => {
    const p = destinationFromCenter(0, 90_000);
    const far = await insertVenue(db, "Detail far", p.lat, p.lng);
    const id = await insertEvent(db, far.id, "rejected");
    const [{ slug }] = await db.query<{ slug: string }>(`select slug from events where id = $1`, [id]);
    expect(await getPublicEventBySlug(db, slug)).toBeNull();
  });
});
