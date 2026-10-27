import { geodesicDistanceMeters } from "@/lib/geo";
import { normalizeText } from "@/lib/filters";
import { USER_AGENT } from "./http";

/**
 * Geocoding with caching and a strict 1 request/second rate limit (Nominatim
 * usage policy). Results carry a confidence and an uncertainty radius derived
 * from what was matched (building vs. street vs. whole town).
 */

export interface GeocodeResult {
  lat: number;
  lng: number;
  displayName: string;
  provider: string;
  matchLevel: "poi" | "building" | "street" | "locality" | "region";
  confidence: number; // 0..1
  uncertaintyMeters: number;
}

export interface GeocodeQuery {
  name?: string | null;
  address?: string | null;
  locality?: string | null;
}

export interface GeocodeCache {
  get(key: string): Promise<GeocodeResult | null | undefined>; // undefined = not cached, null = cached "no result"
  set(key: string, provider: string, value: GeocodeResult | null): Promise<void>;
}

export interface Geocoder {
  geocode(q: GeocodeQuery): Promise<GeocodeResult | null>;
}

interface NominatimHit {
  lat: string;
  lon: string;
  category: string;
  type: string;
  addresstype?: string;
  boundingbox: [string, string, string, string];
  display_name: string;
}

export function classifyNominatimHit(h: NominatimHit): Pick<GeocodeResult, "matchLevel" | "confidence" | "uncertaintyMeters"> {
  const [s, n, w, e] = h.boundingbox.map(Number);
  const halfDiag = geodesicDistanceMeters({ lat: s, lng: w }, { lat: n, lng: e }) / 2;
  const poiCats = ["amenity", "tourism", "leisure", "shop", "historic", "building", "office", "club", "sport", "craft"];
  if (h.category === "place" || h.category === "boundary") {
    const lvl = ["county", "state", "region"].includes(h.addresstype ?? h.type) ? "region" : "locality";
    return { matchLevel: lvl, confidence: 0.3, uncertaintyMeters: Math.max(halfDiag, 2000) };
  }
  // A whole street in the right town: precise enough to verify the 50 km rule when the
  // street is short (its full extent is inside the uncertainty radius used by the check).
  if (h.category === "highway")
    return { matchLevel: "street", confidence: halfDiag <= 1500 ? 0.75 : 0.5, uncertaintyMeters: Math.max(halfDiag, 150) };
  if (h.category === "landuse") return { matchLevel: "poi", confidence: 0.8, uncertaintyMeters: Math.max(halfDiag, 100) };
  if (poiCats.includes(h.category) || h.category === "place" || h.addresstype === "building")
    return { matchLevel: h.category === "building" ? "building" : "poi", confidence: 0.9, uncertaintyMeters: Math.max(halfDiag, 30) };
  return { matchLevel: "poi", confidence: 0.7, uncertaintyMeters: Math.max(halfDiag, 100) };
}

const ABBREVIATIONS: [RegExp, string][] = [
  [/^(bd|bdul|bv|bul|blvd)\.?\s+/i, "Bulevardul "],
  [/^(str|st)\.?\s+/i, "Strada "],
  [/^(cal)\.?\s+/i, "Calea "],
  [/^(p-?ța|p-?ta|pta|pța|pţa)\.?\s+/i, "Piața "],
  [/^(spl)\.?\s+/i, "Splaiul "],
  [/^(al)\.?\s+/i, "Aleea "],
  [/^(int)\.?\s+/i, "Intrarea "],
];

/** "Bv. Iuliu Maniu nr 23A" → "23A Bulevardul Iuliu Maniu" (house number first, abbreviations expanded). */
export function normalizeStreet(address: string): string {
  let a = address
    .split(",")
    .map((p) => p.trim())
    .filter((p) => p && !/\b(et\.?|etaj|ap\.?|interfon|sc\.?|bloc|bl\.)\b/i.test(p) && !/^\d{6}$/.test(p))
    .join(", ");
  for (const [re, full] of ABBREVIATIONS) a = a.replace(re, full);
  a = a.replace(/\b(nr\.?|numărul|numarul)\s*/gi, "");
  const m = a.match(/^([^,\d]+?)[,\s]+(\d+[A-Za-z]?)\b/);
  if (m) return `${m[2]} ${m[1].trim()}`;
  return a.split(",")[0].trim();
}

let lastCall = 0;
async function nominatimRaw(params: Record<string, string>): Promise<NominatimHit[]> {
  const wait = lastCall + 1100 - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastCall = Date.now();
  const base = process.env.NOMINATIM_URL ?? "https://nominatim.openstreetmap.org";
  const url = `${base}/search?${new URLSearchParams({ ...params, format: "jsonv2", limit: "1", countrycodes: "ro" })}`;
  const headers: Record<string, string> = { "User-Agent": USER_AGENT, "Accept-Language": "ro" };
  if (process.env.NOMINATIM_EMAIL) headers.From = process.env.NOMINATIM_EMAIL;
  const res = await fetch(url, { headers, signal: AbortSignal.timeout(15_000) });
  if (!res.ok) throw new Error(`nominatim ${res.status}`);
  return (await res.json()) as NominatimHit[];
}

export class NominatimGeocoder implements Geocoder {
  constructor(private cache: GeocodeCache) {}

  private async cached(rawKey: string, params: Record<string, string>): Promise<GeocodeResult | null> {
    const key = `v2|${rawKey}`; // bump when classification rules change
    const hit = await this.cache.get(key);
    if (hit !== undefined) return hit;
    const [h] = await nominatimRaw(params);
    const value: GeocodeResult | null = h
      ? { lat: Number(h.lat), lng: Number(h.lon), displayName: h.display_name, provider: "nominatim", ...classifyNominatimHit(h) }
      : null;
    await this.cache.set(key, "nominatim", value);
    return value;
  }

  /**
   * Tries the most precise query first. A locality supplied by the SOURCE for the
   * venue is used; the organizer's city is never passed in here.
   */
  async geocode(q: GeocodeQuery): Promise<GeocodeResult | null> {
    const attempts: [string, Record<string, string>][] = [];
    if (q.address && q.locality) {
      const street = normalizeStreet(q.address);
      attempts.push([`s|${normalizeText(street)}|${normalizeText(q.locality)}`, { street, city: q.locality }]);
    }
    if (q.name && q.locality) attempts.push([`q|${normalizeText(`${q.name}, ${q.locality}`)}`, { q: `${q.name}, ${q.locality}` }]);
    if (q.address) attempts.push([`q|${normalizeText(q.address)}`, { q: q.address }]);
    if (!attempts.length && q.locality) attempts.push([`q|${normalizeText(q.locality)}`, { q: q.locality }]);

    let coarse: GeocodeResult | null = null;
    for (const [key, params] of attempts) {
      const r = await this.cached(key, params);
      if (!r) continue;
      if (q.locality && !normalizeText(r.displayName).includes(normalizeText(q.locality))) {
        // Matched something in another town: keep as low-confidence evidence only.
        coarse ??= { ...r, confidence: Math.min(r.confidence, 0.3) };
        continue;
      }
      if (r.matchLevel === "locality" || r.matchLevel === "region") {
        coarse ??= r;
        continue;
      }
      return r;
    }
    if (!coarse && q.locality && attempts.every(([k]) => k !== `q|${normalizeText(q.locality!)}`)) {
      coarse = await this.cached(`q|${normalizeText(q.locality)}`, { q: q.locality });
    }
    return coarse;
  }
}
