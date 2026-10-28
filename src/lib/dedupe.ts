import { DateTime } from "luxon";
import { geodesicDistanceMeters, type LatLng } from "./geo";
import { normalizeText } from "./filters";

const STOPWORDS = new Set([
  "si", "de", "la", "in", "cu", "pentru", "the", "a", "an", "of", "and", "concert", "spectacol",
  "eveniment", "timisoara", "editia", "bilete",
]);

export function titleTokens(title: string): Set<string> {
  return new Set(
    normalizeText(title)
      .replace(/[^a-z0-9 ]+/g, " ")
      .split(/\s+/)
      .filter((t) => t.length > 1 && !STOPWORDS.has(t)),
  );
}

export function titleSimilarity(a: string, b: string): number {
  const ta = titleTokens(a);
  const tb = titleTokens(b);
  if (!ta.size || !tb.size) return 0;
  let inter = 0;
  for (const t of ta) if (tb.has(t)) inter++;
  return inter / Math.min(ta.size, tb.size); // overlap coefficient: robust to "Artist" vs "Artist — Tour 2026"
}

export interface DedupeCandidate {
  title: string;
  startsAt: string | null;
  venue: Partial<LatLng> & { name?: string | null };
}

/**
 * Two records are the same event when they happen at (nearly) the same place and
 * time and their titles strongly overlap. Deterministic; AI may only *suggest* extra pairs.
 */
export function isLikelyDuplicate(
  a: DedupeCandidate,
  b: DedupeCandidate,
  opts: { sameSlotIsEnough?: boolean } = {},
): { duplicate: boolean; score: number } {
  if (!a.startsAt || !b.startsAt) return { duplicate: false, score: 0 };
  const dt = Math.abs(
    DateTime.fromISO(a.startsAt, { setZone: true }).toMillis() - DateTime.fromISO(b.startsAt, { setZone: true }).toMillis(),
  );
  if (dt > 45 * 60 * 1000) return { duplicate: false, score: 0 };

  let samePlace = false;
  let sameBuilding = false;
  if (a.venue.lat != null && a.venue.lng != null && b.venue.lat != null && b.venue.lng != null) {
    const d = geodesicDistanceMeters(a.venue as LatLng, b.venue as LatLng);
    samePlace = d <= 250;
    sameBuilding = d <= 60;
  } else if (a.venue.name && b.venue.name) {
    samePlace = titleSimilarity(a.venue.name, b.venue.name) >= 0.6;
  }
  if (!samePlace) return { duplicate: false, score: 0 };

  const sim = titleSimilarity(a.title, b.title);
  const score = sim * 0.8 + (1 - dt / (45 * 60 * 1000)) * 0.2;
  // A newspaper headline rarely matches the venue's own title; for such secondary sources the
  // same building (not merely the same street) within 45 minutes is the same event.
  return { duplicate: sim >= 0.6 || (Boolean(opts.sameSlotIsEnough) && sameBuilding), score: Math.round(score * 100) / 100 };
}

export function slugify(s: string): string {
  return normalizeText(s)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}
