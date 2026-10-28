import { describe, expect, it } from "vitest";
import { PLACES, PLACE_CATEGORIES } from "@/data/places";
import { checkGeofence } from "@/lib/geo";

describe("places to visit", () => {
  it("are all inside the 50 km radius, with unique ids and known categories and ages", () => {
    const ids = new Set<string>();
    for (const p of PLACES) {
      expect(checkGeofence({ lat: p.lat, lng: p.lng }).ok, p.id).toBe(true);
      expect(ids.has(p.id), p.id).toBe(false);
      ids.add(p.id);
      expect(PLACE_CATEGORIES[p.cat], p.id).toBeTruthy();
      expect(p.ages.length, p.id).toBeGreaterThan(0);
      expect(p.ages.every((a) => ["0-2", "3-7", "8-12", "13-17", "18-64", "65+"].includes(a)), p.id).toBe(true);
      if (p.url) expect(p.url, p.id).toMatch(/^https:\/\//);
    }
  });

  it("include the requested places for children, karting, climbing and L'iziera", () => {
    const names = PLACES.map((p) => p.name).join(" | ");
    expect(names).toMatch(/Muzeul Interactiv al Copiilor/);
    expect(PLACES.filter((p) => /karting/i.test(p.name) && p.cat === "sport")).toHaveLength(2);
    expect(PLACES.filter((p) => /One Move/.test(p.name))).toHaveLength(2);
    expect(names).toMatch(/L'iziera Park/);
    for (const g of ["0-2", "3-7", "8-12", "13-17", "18-64", "65+"] as const) expect(PLACES.some((p) => p.ages.includes(g)), g).toBe(true);
  });
});
