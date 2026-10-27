import { DateTime } from "luxon";
import { familyScore, matchesAgeFilter } from "./age";
import { overlaps, timeOfDayOf } from "./dates";
import { checkGeofence, inDistanceBand } from "./geo";
import type { EventFilters, PublicEvent } from "./types";

/**
 * Last line of defense before anything leaves a public API or page: an event is
 * visible only if it is published, physical, and its verified venue is inside the radius.
 */
export function isPubliclyVisible(e: PublicEvent): boolean {
  if (e.status !== "published" && e.status !== "canceled") return false;
  if (e.attendanceMode === "online") return false;
  if (e.venue.geoStatus !== "verified") return false;
  const g = checkGeofence({ lat: e.venue.lat ?? undefined, lng: e.venue.lng ?? undefined });
  return g.ok;
}

export function normalizeText(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

export function applyFilters(events: PublicEvent[], f: EventFilters, now: Date = new Date()): PublicEvent[] {
  const from = DateTime.fromISO(f.from, { setZone: true });
  const to = DateTime.fromISO(f.to, { setZone: true });
  const nowDt = DateTime.fromJSDate(now);
  const q = f.q ? normalizeText(f.q) : null;

  const out = events.filter((e) => {
    if (!isPubliclyVisible(e)) return false;

    if (e.kind === "scheduled") {
      const hit = e.sessions.some(
        (s) =>
          s.status !== "canceled" &&
          overlaps(s.startsAt, s.endsAt, from, to) &&
          DateTime.fromISO(s.endsAt ?? s.startsAt, { setZone: true }) >= nowDt.minus({ hours: 1 }) &&
          (!f.timeOfDay?.length || s.allDay || f.timeOfDay.includes(timeOfDayOf(s.startsAt))),
      );
      // Canceled events stay visible (clearly marked) only if one of their dates is in range.
      const canceledHit =
        e.status === "canceled" && e.sessions.some((s) => overlaps(s.startsAt, s.endsAt, from, to));
      if (!hit && !canceledHit) return false;
    } else {
      if (f.includeEvergreen === false) return false;
      if (e.status === "canceled") return false;
    }

    if (!matchesAgeFilter(e, f.ageGroups, f.familyMode)) return false;
    if (f.categories?.length && !e.categories.some((c) => f.categories!.includes(c))) return false;
    if (f.price === "free" && e.isFree !== true) return false;
    if (f.price === "paid" && e.isFree !== false) return false;
    if (f.indoorOutdoor && e.indoorOutdoor !== f.indoorOutdoor && e.indoorOutdoor !== "mixed") return false;
    if (f.locality && normalizeText(e.venue.locality) !== normalizeText(f.locality)) return false;
    if (f.distanceBand && !inDistanceBand(e.venue.distanceKm ?? Infinity, f.distanceBand)) return false;
    if (f.familyFriendly && !(e.familyFriendly || e.allAges)) return false;
    if (f.accessible && !e.accessibility) return false;
    if (q && !normalizeText(`${e.title} ${e.venue.name} ${e.venue.locality} ${e.organizer ?? ""}`).includes(q))
      return false;
    return true;
  });

  return sortEvents(out, f, from);
}

function firstSessionInRange(e: PublicEvent, from: DateTime): number {
  const s = e.sessions
    .map((x) => DateTime.fromISO(x.startsAt, { setZone: true }))
    .filter((d) => d >= from.minus({ days: 1 }))
    .sort((a, b) => a.toMillis() - b.toMillis())[0];
  return s ? s.toMillis() : Number.MAX_SAFE_INTEGER;
}

function sortEvents(events: PublicEvent[], f: EventFilters, from: DateTime): PublicEvent[] {
  return [...events].sort((a, b) => {
    // Scheduled events first (chronological), evergreen attractions after.
    if (a.kind !== b.kind) return a.kind === "scheduled" ? -1 : 1;
    if (a.status !== b.status) return a.status === "canceled" ? 1 : b.status === "canceled" ? -1 : 0;
    if (f.familyMode && f.ageGroups?.length) {
      const d = familyScore(b, f.ageGroups) - familyScore(a, f.ageGroups);
      if (d) return d;
    }
    if (a.kind === "scheduled") return firstSessionInRange(a, from) - firstSessionInRange(b, from);
    return (a.venue.distanceKm ?? 99) - (b.venue.distanceKm ?? 99);
  });
}

export function localitiesOf(events: PublicEvent[]): string[] {
  return [...new Set(events.map((e) => e.venue.locality))].sort((a, b) => a.localeCompare(b, "ro"));
}
