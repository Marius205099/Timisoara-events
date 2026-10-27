import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { groupSessions, jsonLdAdapter, parseJsonLdEvents } from "@/ingestion/adapters/jsonld";
import { parseVisitEvent } from "@/ingestion/adapters/visit-timisoara";
import { matchKnownVenue } from "@/ingestion/known-venues";

// Real snapshots captured on 2026-10-27 from the public sources.
const fx = (n: string) => fs.readFileSync(path.join(__dirname, "..", "fixtures", n), "utf8");

describe("Zile și Nopți (JSON-LD, one node per performance)", () => {
  it("groups the performances of one event into sessions, with source coordinates", () => {
    const url = "https://zilesinopti.ro/evenimente/animus-championship-2026/";
    const nodes = parseJsonLdEvents(fx("zilesinopti-event.html"), url, "zilesinopti");
    expect(nodes.length).toBe(42);
    const [ev] = groupSessions(nodes);
    expect(groupSessions(nodes)).toHaveLength(1);
    expect(ev.sessions).toHaveLength(42);
    expect(ev.sessions[0].startsAt).toBe("2026-11-01T13:00:00.000+02:00");
    expect(ev.venue.name).toBe("ANIMUS Arena");
    expect(ev.venue.lat).toBeCloseTo(45.774505, 5);
    expect(ev.venue.lng).toBeCloseTo(21.212193, 5);
  });
});

describe("Timisoreni.ro (ItemList listing + detail pages)", () => {
  it("reads events nested in an ItemList", () => {
    const evs = parseJsonLdEvents(fx("timisoreni-hub.html"), "https://www.timisoreni.ro/hub/evenimente/", "timisoreni");
    expect(evs.length).toBeGreaterThanOrEqual(25);
    expect(evs.some((e) => e.venue.name === "Sala Capitol")).toBe(true);
  });

  it("takes the venue from the listing when the detail page only names the town, and drops multiplex films", async () => {
    const hub = fx("timisoreni-hub.html");
    const detail = (url: string, name: string) =>
      `<script type="application/ld+json">${JSON.stringify({
        "@context": "https://schema.org", "@type": "Event", name, url, startDate: "2026-10-30T19:00:00",
        location: { "@type": "Place", name: "Timișoara", address: { "@type": "PostalAddress", addressLocality: "Timișoara" } },
      })}</script>`;
    const evs = await jsonLdAdapter.fetch(
      { sourceId: "timisoreni", listUrls: ["https://www.timisoreni.ro/hub/evenimente/"], linkPattern: "^/despre/[a-z0-9-]+/$", excludeVenuePattern: "^Cinema City", maxEvents: 100 },
      {
        now: new Date("2026-10-27T10:00:00Z"),
        log: () => {},
        fetchText: async (u) => (u.includes("/hub/") ? hub : detail(u, u.split("/").at(-2)!)),
      },
    );
    expect(evs.length).toBeGreaterThan(0);
    expect(evs.every((e) => !/^Cinema City/.test(e.venue.name ?? ""))).toBe(true);
    expect(evs.every((e) => e.venue.name !== "Timișoara")).toBe(true);
    const capitol = evs.find((e) => e.venue.name === "Sala Capitol")!;
    expect(capitol.sessions).toEqual([{ startsAt: "2026-10-30T19:00:00.000+02:00", endsAt: null, allDay: false }]);
  });
});

describe("Visit Timișoara (Primăria Timișoara portal)", () => {
  const items = JSON.parse(fx("visit-timisoara.json")) as Parameters<typeof parseVisitEvent>[0][];
  const byId = (id: number) => parseVisitEvent(items.find((i) => i.id === id)!, "visit-timisoara")!;

  it("combines the UTC-midnight day with the local start time", () => {
    const e = byId(36937); // Murakami Favorites – Jazz
    expect(e.sessions[0]).toMatchObject({ startsAt: "2026-10-29T19:00:00.000+02:00", allDay: false });
    expect(e.title).toBe("Murakami Favorites – Jazz");
  });

  it("keeps the start time of a night event ending the next day", () => {
    const e = byId(36942);
    expect(e.sessions[0].startsAt).toBe("2026-10-31T23:00:00.000+02:00");
  });

  it("turns a multi-day range into one all-day session and leaves an unknown venue empty", () => {
    const e = byId(36932); // Caravana Paradiso 2026
    expect(e.sessions[0]).toMatchObject({ startsAt: "2026-10-30T00:00:00.000+02:00", allDay: true });
    expect(e.sessions[0].endsAt?.startsWith("2026-11-01T23:59:59")).toBe(true);
    expect(e.venue.name).toBeNull();
  });
});

describe("venue registry additions", () => {
  it("matches prefixed single-venue names", () => {
    expect(matchKnownVenue("FABER Timișoara – Hala III")?.key).toBe("faber");
    expect(matchKnownVenue("Cinema Victoria")?.key).toBe("cinema-victoria");
    expect(matchKnownVenue("Hala III")).toBeNull();
  });
});

describe("town-only venues", () => {
  it("are never verified, even when the geocoder finds a point with that name", async () => {
    const { verifyVenueLocation } = await import("@/ingestion/locate");
    const geocoder = {
      geocode: async () => ({ lat: 45.75, lng: 21.21, displayName: "Timișoara (POI)", provider: "nominatim", matchLevel: "poi" as const, confidence: 0.9, uncertaintyMeters: 30 }),
    };
    const v = await verifyVenueLocation({ name: "Timișoara", address: null, locality: "Timișoara" }, "offline", { geocoder });
    expect(v).toMatchObject({ decision: "review", reason: "venue_unknown" });
    // Same with the town centre published as the venue's coordinates.
    const centre = await verifyVenueLocation({ name: "Timișoara", address: "Timișoara, Timişoara", locality: "Timişoara", lat: 45.748872, lng: 21.208679 }, "offline", { geocoder });
    expect(centre).toMatchObject({ decision: "review", reason: "venue_unknown" });
    const ok = await verifyVenueLocation({ name: "ANIMUS Arena", address: "Calea Torontalului 69, Timișoara", locality: "Timișoara" }, "offline", { geocoder });
    expect(ok.decision).toBe("verified");
  });
});
