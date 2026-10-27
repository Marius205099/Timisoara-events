import { describe, expect, it } from "vitest";
import { matchesAgeFilter, parseOfficialAge } from "@/lib/age";
import { applyFilters } from "@/lib/filters";
import type { PublicEvent } from "@/lib/types";

function ev(p: Partial<PublicEvent> & { id: string }): PublicEvent {
  return {
    slug: p.id, kind: "scheduled", status: "published", title: p.id, summary: "", description: null, imageUrl: null, imageCredit: null,
    categories: ["concerte"], recommendedAgeGroups: [], allAges: false, familyFriendly: false, officialMinAge: null, officialMaxAge: null,
    accessibility: null, isFree: null, priceMin: null, priceMax: null, currency: null, indoorOutdoor: "indoor", attendanceMode: "offline",
    organizer: null, ticketUrl: null,
    venue: { id: "v", name: "Sala", address: null, locality: "Timișoara", lat: 45.75, lng: 21.22, distanceKm: 1, geoStatus: "verified", geoSource: "known_venue", geoConfidence: 1 },
    sessions: [{ id: "s", startsAt: "2026-10-31T18:00:00+02:00", endsAt: "2026-10-31T20:00:00+02:00", allDay: false, status: "scheduled" }],
    openingHours: null, sources: [], lastVerifiedAt: "2026-10-27T00:00:00Z", uncertaintyNote: null, aiConfidence: null, isDemo: false,
    ...p,
  };
}

const classicCars = ev({ id: "cars", allAges: true, familyFriendly: true, categories: ["auto-clasic"] });
const kidsWorkshop = ev({ id: "kids", recommendedAgeGroups: ["3-7"], familyFriendly: true, categories: ["ateliere"] });
const nightlife = ev({ id: "night", recommendedAgeGroups: ["18-64"], officialMinAge: 18, categories: ["viata-de-noapte"] });
const classical = ev({ id: "classical", recommendedAgeGroups: ["13-17", "18-64", "65+"] });
const teenConcert16 = ev({ id: "teen16", recommendedAgeGroups: ["13-17", "18-64"], officialMinAge: 16 });

const all = [classicCars, kidsWorkshop, nightlife, classical, teenConcert16];
const window = { from: "2026-10-31T00:00:00+02:00", to: "2026-10-31T23:59:59+02:00" };
const now = new Date("2026-10-27T12:00:00Z");
const ids = (xs: PublicEvent[]) => xs.map((x) => x.id).sort();

describe("age filtering", () => {
  it("ALL AGES (default) shows every eligible event", () => {
    expect(ids(applyFilters(all, window, now))).toEqual(ids(all));
  });

  it("3–7 shows kids events and universal events, never 18+", () => {
    expect(ids(applyFilters(all, { ...window, ageGroups: ["3-7"] }, now))).toEqual(["cars", "kids"]);
  });

  it("all-ages events stay visible under any age filter", () => {
    for (const g of ["0-2", "3-7", "8-12", "13-17", "18-64", "65+"] as const)
      expect(ids(applyFilters(all, { ...window, ageGroups: [g] }, now))).toContain("cars");
  });

  it("an official 18+ restriction excludes minors even if a group is selected together with adults", () => {
    expect(matchesAgeFilter(nightlife, ["13-17"])).toBe(false);
    expect(matchesAgeFilter(nightlife, ["13-17", "18-64"])).toBe(true); // adults may still go
    expect(matchesAgeFilter(nightlife, ["13-17", "18-64"], true)).toBe(false); // family mode: everyone must be admitted
  });

  it("multiple groups: 65+ gets classical concerts", () => {
    expect(ids(applyFilters(all, { ...window, ageGroups: ["65+"] }, now))).toEqual(["cars", "classical"]);
  });

  it("FAMILY mode with kids + adults keeps only events suitable for everyone, universal first", () => {
    const r = applyFilters(all, { ...window, ageGroups: ["3-7", "18-64"], familyMode: true }, now);
    // The kids workshop is family-friendly (parents accompany); 18+, teen and classical events drop out.
    expect(r.map((x) => x.id)).toEqual(["cars", "kids"]);
  });

  it("official 16+ allows the 13–17 group (16 and 17 year olds) but not in family mode with a 10-year-old", () => {
    expect(matchesAgeFilter(teenConcert16, ["13-17"])).toBe(true);
    expect(matchesAgeFilter(teenConcert16, ["8-12", "18-64"], true)).toBe(false);
  });

  it("parses official restrictions from source labels", () => {
    expect(parseOfficialAge("+16 ani")).toEqual({ min: 16, max: null });
    expect(parseOfficialAge("14+")).toEqual({ min: 14, max: null });
    expect(parseOfficialAge("Acces 18+ only")).toEqual({ min: 18, max: null });
    expect(parseOfficialAge("6-12 ani")).toEqual({ min: 6, max: 12 });
    expect(parseOfficialAge("Spectacol pentru toată familia")).toEqual({ min: null, max: null });
  });
});

describe("public visibility guard in filters", () => {
  it("never returns an event whose venue is outside 50 km, even if marked published", () => {
    const far = ev({ id: "far", venue: { ...classicCars.venue, lat: 47.0549, lng: 21.9285, distanceKm: 141 } });
    expect(ids(applyFilters([far, classicCars], window, now))).toEqual(["cars"]);
  });
  it("never returns unverified venues or online events", () => {
    const unverified = ev({ id: "u", venue: { ...classicCars.venue, geoStatus: "unverified" } });
    const online = ev({ id: "o", attendanceMode: "online" });
    expect(applyFilters([unverified, online], window, now)).toHaveLength(0);
  });
  it("canceled sessions are not offered as plans; canceled events are shown marked", () => {
    const canceled = ev({ id: "c", status: "canceled", sessions: [{ ...classicCars.sessions[0], status: "canceled" }] });
    expect(ids(applyFilters([canceled], window, now))).toEqual(["c"]);
  });
  it("free / paid / distance / locality filters", () => {
    const free = ev({ id: "free", isFree: true });
    const paid = ev({ id: "paid", isFree: false, venue: { ...classicCars.venue, locality: "Recaș", distanceKm: 23 } });
    expect(ids(applyFilters([free, paid], { ...window, price: "free" }, now))).toEqual(["free"]);
    expect(ids(applyFilters([free, paid], { ...window, distanceBand: "10-25" }, now))).toEqual(["paid"]);
    expect(ids(applyFilters([free, paid], { ...window, locality: "recas" }, now))).toEqual(["paid"]);
  });
});
