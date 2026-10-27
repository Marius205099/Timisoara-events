import { GEOFENCE_MAX_METERS } from "@/lib/config";
import { checkGeofence, isValidCoordinate, roundKm, BOUNDARY_TOLERANCE_METERS } from "@/lib/geo";
import type { AttendanceMode } from "@/lib/types";
import type { Geocoder } from "./geocode";
import { matchKnownVenue, type KnownVenue } from "./known-venues";
import type { RawEvent } from "./types";
import { guessLocality } from "./text";
import { normalizeText } from "@/lib/filters";

/**
 * Deterministic venue verification. The ONLY inputs are the event's own venue
 * fields — the organizer object is deliberately not accepted by this function.
 */

export const MIN_AUTO_CONFIDENCE = 0.75;
export const MAX_AUTO_UNCERTAINTY_M = 1500; // the 50 km check itself adds this radius, so the guarantee holds

export type LocationDecision = "verified" | "review" | "reject";
export type LocationReason =
  | "ok"
  | "online_only"
  | "venue_unknown"
  | "venue_not_found"
  | "low_confidence_location"
  | "near_boundary"
  | "out_of_radius"
  | "geocoder_error";

export interface LocationVerdict {
  decision: LocationDecision;
  reason: LocationReason;
  venue: {
    name: string;
    address: string | null;
    locality: string;
    lat: number | null;
    lng: number | null;
    distanceKm: number | null;
    geoSource: string | null;
    geoConfidence: number | null;
    uncertaintyMeters: number | null;
  };
  detail?: string;
}

export async function verifyVenueLocation(
  venue: RawEvent["venue"],
  attendanceMode: AttendanceMode | undefined,
  deps: { geocoder: Geocoder; knownVenues?: KnownVenue[]; maxMeters?: number },
): Promise<LocationVerdict> {
  const max = deps.maxMeters ?? GEOFENCE_MAX_METERS;
  const base = {
    name: venue.name?.trim() || venue.address?.trim() || "Locație nespecificată",
    address: venue.address ?? null,
    locality: venue.locality ?? "",
  };
  const empty = { lat: null, lng: null, distanceKm: null, geoSource: null, geoConfidence: null, uncertaintyMeters: null };

  if (attendanceMode === "online") return { decision: "reject", reason: "online_only", venue: { ...base, ...empty } };
  if (!venue.name && !venue.address && !isValidCoordinate({ lat: venue.lat ?? undefined, lng: venue.lng ?? undefined }))
    return { decision: "review", reason: "venue_unknown", venue: { ...base, ...empty } };

  // A "venue" that is only a town name ("Timișoara") does not identify a place: its coordinates are the town
  // centre (or an unrelated POI of that name), so it is never treated as a verified location.
  const townOnly = (s: string | null | undefined) =>
    !!s &&
    s.split(",").map((p) => p.trim()).filter((p) => p && !/^rom[aâ]nia$/i.test(p))
      .every((p) => normalizeText(guessLocality(p) ?? "") === normalizeText(p));
  if (townOnly(venue.name) && (!venue.address || townOnly(venue.address)))
    return { decision: "review", reason: "venue_unknown", venue: { ...base, ...empty } };

  // Exact coordinates: an admin-verified/known venue, or coordinates published by the source for this venue.
  // A same-named venue in another town ("Teatrul Național Cluj") must not borrow Timișoara coordinates.
  const knownCandidate = matchKnownVenue(venue.name, deps.knownVenues);
  const otherTown = guessLocality(`${venue.locality ?? ""} ${venue.address ?? ""} ${venue.name ?? ""}`);
  const known =
    knownCandidate && (!otherTown || normalizeText(otherTown) === normalizeText(knownCandidate.locality)) ? knownCandidate : null;
  const exact = known
    ? { lat: known.lat, lng: known.lng, source: "known_venue", conf: 1, name: known.name, address: known.address, locality: known.locality }
    : isValidCoordinate({ lat: venue.lat ?? undefined, lng: venue.lng ?? undefined })
      ? { lat: venue.lat!, lng: venue.lng!, source: "source_geo", conf: 0.9, name: base.name, address: base.address, locality: base.locality }
      : null;

  if (exact) {
    const g = checkGeofence({ lat: exact.lat, lng: exact.lng }, max);
    const v = {
      name: exact.name, address: exact.address, locality: exact.locality || base.locality,
      lat: exact.lat, lng: exact.lng, geoSource: exact.source, geoConfidence: exact.conf, uncertaintyMeters: 0,
    };
    if (g.ok) return { decision: "verified", reason: "ok", venue: { ...v, distanceKm: g.distanceKm } };
    if (g.reason === "outside_radius") return { decision: "reject", reason: "out_of_radius", venue: { ...v, distanceKm: g.distanceKm } };
  }

  let r;
  try {
    r = await deps.geocoder.geocode({ name: venue.name, address: venue.address, locality: venue.locality });
  } catch (e) {
    return { decision: "review", reason: "geocoder_error", venue: { ...base, ...empty }, detail: (e as Error).message };
  }
  if (!r) return { decision: "review", reason: "venue_not_found", venue: { ...base, ...empty } };

  const g = checkGeofence({ lat: r.lat, lng: r.lng }, Number.MAX_SAFE_INTEGER);
  const d = g.ok ? g.distanceMeters : Infinity;
  const v = {
    ...base,
    locality: base.locality || (r.displayName.split(",").map((s) => s.trim()).find((p) => /timi[șs]oara/i.test(p)) ?? ""),
    lat: r.lat, lng: r.lng, distanceKm: roundKm(d), geoSource: r.provider, geoConfidence: r.confidence, uncertaintyMeters: r.uncertaintyMeters,
  };

  // Clearly outside even in the most favourable reading of the uncertainty → reject.
  if (d - r.uncertaintyMeters > max + BOUNDARY_TOLERANCE_METERS)
    return { decision: "reject", reason: "out_of_radius", venue: v, detail: r.displayName };
  if (r.confidence < MIN_AUTO_CONFIDENCE || r.uncertaintyMeters > MAX_AUTO_UNCERTAINTY_M)
    return { decision: "review", reason: "low_confidence_location", venue: v, detail: `${r.matchLevel}: ${r.displayName}` };
  if (d + r.uncertaintyMeters > max + BOUNDARY_TOLERANCE_METERS)
    return { decision: "review", reason: "near_boundary", venue: v, detail: r.displayName };
  return { decision: "verified", reason: "ok", venue: v, detail: r.displayName };
}
