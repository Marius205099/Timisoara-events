import { describe, expect, it } from "vitest";
import { checkGeofence, destinationFromCenter, distanceFromCenterMeters, inDistanceBand } from "@/lib/geo";
import { GEOFENCE_MAX_METERS, HARD_MAX_RADIUS_METERS, TIMISOARA_CENTER } from "@/lib/config";

describe("geofence (application layer)", () => {
  it("defaults to and never exceeds 50 km", () => {
    expect(GEOFENCE_MAX_METERS).toBe(50_000);
    expect(HARD_MAX_RADIUS_METERS).toBe(50_000);
  });

  it("includes the center", () => {
    const r = checkGeofence(TIMISOARA_CENTER);
    expect(r.ok).toBe(true);
  });

  it.each([0, 45, 90, 135, 180, 225, 270, 315])("includes a point exactly 50 km away (bearing %i°)", (bearing) => {
    const p = destinationFromCenter(bearing, 50_000);
    expect(distanceFromCenterMeters(p)).toBeCloseTo(50_000, 3);
    expect(checkGeofence(p).ok).toBe(true);
  });

  it.each([0, 90, 180, 270])("excludes a point 50.01 km away (bearing %i°)", (bearing) => {
    const r = checkGeofence(destinationFromCenter(bearing, 50_010));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("outside_radius");
  });

  it("excludes a point 1 m beyond the boundary", () => {
    expect(checkGeofence(destinationFromCenter(33, 50_001)).ok).toBe(false);
  });

  it("decides by coordinates, not by county or name: Arad (other county) vs Lugoj (Timiș county)", () => {
    // Arad city centre is in Arad county but inside the radius; Lugoj is in Timiș county but outside it.
    const arad = checkGeofence({ lat: 46.1866, lng: 21.3123 });
    const lugoj = checkGeofence({ lat: 45.6862542, lng: 21.9063162 });
    expect(arad.ok).toBe(true);
    expect(lugoj.ok).toBe(false);
    if (!lugoj.ok && lugoj.reason === "outside_radius") expect(lugoj.distanceKm).toBeGreaterThan(50);
  });

  it("rejects invalid or missing coordinates", () => {
    expect(checkGeofence(null).ok).toBe(false);
    expect(checkGeofence({ lat: NaN, lng: 21 }).ok).toBe(false);
    expect(checkGeofence({ lat: 0, lng: 0 }).ok).toBe(false);
    expect(checkGeofence({ lat: 91, lng: 21 }).ok).toBe(false);
  });

  it("assigns every distance to exactly one band", () => {
    for (const km of [0, 5, 10, 10.01, 25, 25.5, 50]) {
      const hits = (["0-10", "10-25", "25-50"] as const).filter((b) => inDistanceBand(km, b));
      expect(hits).toHaveLength(1);
    }
    expect(inDistanceBand(50.01, "25-50")).toBe(false);
  });
});
