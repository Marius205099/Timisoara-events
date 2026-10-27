import { Geodesic } from "geographiclib-geodesic";
import { GEOFENCE_MAX_METERS, TIMISOARA_CENTER } from "./config";

/**
 * Geodesic distance on the WGS84 ellipsoid (Karney's algorithm) — the same model
 * PostGIS uses for `geography` distances, so app-side and DB-side checks agree.
 */
const WGS84 = Geodesic.WGS84;

/** Tolerance for floating-point noise so a point exactly on the 50 km circle is included. */
export const BOUNDARY_TOLERANCE_METERS = 0.001;

export interface LatLng {
  lat: number;
  lng: number;
}

export function isValidCoordinate(p: Partial<LatLng> | null | undefined): p is LatLng {
  return (
    !!p &&
    typeof p.lat === "number" &&
    typeof p.lng === "number" &&
    Number.isFinite(p.lat) &&
    Number.isFinite(p.lng) &&
    Math.abs(p.lat) <= 90 &&
    Math.abs(p.lng) <= 180 &&
    !(p.lat === 0 && p.lng === 0)
  );
}

export function geodesicDistanceMeters(a: LatLng, b: LatLng): number {
  return WGS84.Inverse(a.lat, a.lng, b.lat, b.lng).s12 ?? NaN;
}

export function distanceFromCenterMeters(p: LatLng): number {
  return geodesicDistanceMeters(TIMISOARA_CENTER, p);
}

/** Point at a given bearing/distance from the center (used by tests and admin tooling). */
export function destinationFromCenter(bearingDeg: number, meters: number): LatLng {
  const r = WGS84.Direct(TIMISOARA_CENTER.lat, TIMISOARA_CENTER.lng, bearingDeg, meters);
  return { lat: r.lat2!, lng: r.lon2! };
}

export type GeofenceResult =
  | { ok: true; distanceMeters: number; distanceKm: number }
  | { ok: false; reason: "invalid_coordinates" }
  | { ok: false; reason: "outside_radius"; distanceMeters: number; distanceKm: number };

/** The single source of truth for the 50 km rule in application code. Inclusive boundary. */
export function checkGeofence(p: Partial<LatLng> | null | undefined, maxMeters = GEOFENCE_MAX_METERS): GeofenceResult {
  if (!isValidCoordinate(p)) return { ok: false, reason: "invalid_coordinates" };
  const d = distanceFromCenterMeters(p);
  const distanceKm = roundKm(d);
  if (d <= maxMeters + BOUNDARY_TOLERANCE_METERS) return { ok: true, distanceMeters: d, distanceKm };
  return { ok: false, reason: "outside_radius", distanceMeters: d, distanceKm };
}

export function roundKm(meters: number): number {
  return Math.round(meters / 10) / 100; // 2 decimals (10 m precision)
}

export type DistanceBand = "0-10" | "10-25" | "25-50";
export const DISTANCE_BANDS: { id: DistanceBand; label: string; min: number; max: number }[] = [
  { id: "0-10", label: "0–10 km", min: 0, max: 10 },
  { id: "10-25", label: "10–25 km", min: 10, max: 25 },
  { id: "25-50", label: "25–50 km", min: 25, max: 50 },
];

export function inDistanceBand(km: number, band: DistanceBand): boolean {
  const b = DISTANCE_BANDS.find((x) => x.id === band)!;
  // Lower bound exclusive except for the first band, so each distance falls in exactly one band.
  return (b.min === 0 ? km >= 0 : km > b.min) && km <= b.max;
}

export function formatKm(km: number): string {
  if (km < 1) return `${Math.round(km * 1000)} m`;
  return `${km.toLocaleString("ro-RO", { maximumFractionDigits: 1 })} km`;
}

export function directionsUrl(p: LatLng): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${p.lat},${p.lng}`;
}

export function osmEmbedUrl(p: LatLng): string {
  const d = 0.006;
  const bbox = [p.lng - d, p.lat - d, p.lng + d, p.lat + d].join(",");
  return `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${p.lat},${p.lng}`;
}
