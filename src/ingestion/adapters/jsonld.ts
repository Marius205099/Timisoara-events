import * as cheerio from "cheerio";
import { DateTime } from "luxon";
import { TIMEZONE } from "@/lib/config";
import type { AttendanceMode } from "@/lib/types";
import type { RawEvent, SourceAdapter } from "../types";
import { detectStatusFromText, guessLocality, htmlToText } from "../text";

/**
 * schema.org/Event structured data (JSON-LD) — the format publishers expose for
 * search engines. Used for ticketing sites (e.g. iabilet.ro event pages) and any
 * site that publishes Event markup.
 */

type Json = Record<string, unknown>;

function flatten(node: unknown): Json[] {
  if (!node) return [];
  if (Array.isArray(node)) return node.flatMap(flatten);
  if (typeof node === "object") {
    const o = node as Json;
    if (Array.isArray(o["@graph"])) return flatten(o["@graph"]);
    // Listing pages wrap events in an ItemList (itemListElement[].item).
    if (Array.isArray(o.itemListElement)) return flatten(o.itemListElement.map((li) => (li as Json)?.item ?? li));
    // …often as the mainEntity of a CollectionPage.
    if (o.mainEntity && typeof o.mainEntity === "object") return [o, ...flatten(o.mainEntity)];
    return [o];
  }
  return [];
}

const isEventType = (t: unknown) =>
  (Array.isArray(t) ? t : [t]).some((x) => typeof x === "string" && /Event$/.test(x) && x !== "EventSeries");

function toIso(v: unknown): string | null {
  if (typeof v !== "string" || !v) return null;
  // Date-only or naive values are interpreted in Bucharest local time.
  const d = /[zZ]|[+-]\d{2}:?\d{2}$/.test(v) ? DateTime.fromISO(v, { setZone: true }) : DateTime.fromISO(v, { zone: TIMEZONE });
  return d.isValid ? d.toISO() : null;
}

function attendance(v: unknown): AttendanceMode {
  const s = String(v ?? "");
  if (/Online/i.test(s)) return "online";
  if (/Mixed/i.test(s)) return "hybrid";
  return "offline";
}

export function parseJsonLdEvents(html: string, pageUrl: string, sourceId: string): RawEvent[] {
  const $ = cheerio.load(html);
  const out: RawEvent[] = [];
  $('script[type="application/ld+json"]').each((_, el) => {
    let parsed: unknown;
    try {
      parsed = JSON.parse($(el).contents().text());
    } catch {
      return;
    }
    for (const node of flatten(parsed)) {
      if (!isEventType(node["@type"])) continue;
      const start = toIso(node.startDate);
      if (!start) continue;
      const endRaw = toIso(node.endDate);
      const dateOnlyEnd = typeof node.endDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(node.endDate);
      const loc = (Array.isArray(node.location) ? node.location : [node.location]) as Json[];
      const place = loc.find((l) => l && /Place/.test(String(l["@type"]))) ?? null;
      const addr = (place?.address ?? null) as Json | string | null;
      const addrText = typeof addr === "string" ? addr : addr ? [addr.streetAddress, addr.addressLocality].filter(Boolean).join(", ") : null;
      const geo = (place?.geo ?? null) as Json | null;
      const offers = flatten(node.offers);
      const prices = offers.flatMap((o) => [o.price, o.lowPrice, o.highPrice]).map(Number).filter((n) => Number.isFinite(n));
      const statusUrl = String(node.eventStatus ?? "");
      // Ticketing sites prefix titles with the city ("Timișoara: …"); the venue already says where.
      const name = htmlToText(String(node.name ?? "")).replace(/^\s*[A-ZȘȚĂÂÎ][\p{L}-]+(?: [A-ZȘȚĂÂÎ][\p{L}-]+)?\s*:\s+/u, "");
      const prevStart = toIso(node.previousStartDate);
      const organizer = flatten(node.organizer)[0];
      const image = Array.isArray(node.image) ? node.image[0] : typeof node.image === "object" ? (node.image as Json)?.url : node.image;

      out.push({
        sourceId,
        // Per-performance ids ("…/event/#event-123") identify a session, not the event.
        externalId: String(node.url && String(node["@id"] ?? "").startsWith(`${node.url}#`) ? node.url : node["@id"] ?? node.url ?? `${pageUrl}#${name}-${start}`),
        url: String(node.url ?? pageUrl),
        title: name,
        description: htmlToText(String(node.description ?? "")) || null,
        imageUrl: typeof image === "string" ? image : null,
        kind: "scheduled",
        sessions: [{ startsAt: start, endsAt: dateOnlyEnd ? null : endRaw, allDay: false }],
        // EventRescheduled carries the new, confirmed startDate → scheduled (with a notice).
        // EventPostponed has no confirmed new date → review.
        status: /Cancelled/i.test(statusUrl)
          ? "canceled"
          : /Postponed/i.test(statusUrl)
            ? "postponed"
            : detectStatusFromText(name) ?? "scheduled",
        notice: /Rescheduled/i.test(statusUrl)
          ? `Eveniment reprogramat${prevStart ? ` (data inițială: ${prevStart.slice(8, 10)}.${prevStart.slice(5, 7)}.${prevStart.slice(0, 4)})` : ""}.`
          : null,
        attendanceMode: attendance(node.eventAttendanceMode),
        venue: {
          name: place?.name ? htmlToText(String(place.name)) : null,
          address: addrText,
          locality: (typeof addr === "object" && addr?.addressLocality ? String(addr.addressLocality) : null) ?? guessLocality(addrText),
          lat: geo?.latitude != null ? Number(geo.latitude) : null,
          lng: geo?.longitude != null ? Number(geo.longitude) : null,
        },
        organizer: organizer?.name ? { name: String(organizer.name) } : null,
        officialAgeText: typeof node.typicalAgeRange === "string" ? node.typicalAgeRange : null,
        isFree: node.isAccessibleForFree === true ? true : prices.length ? prices.every((p) => p === 0) : null,
        priceMin: prices.length ? Math.min(...prices) : null,
        priceMax: prices.length ? Math.max(...prices) : null,
        currency: (offers[0]?.priceCurrency as string) ?? null,
        ticketUrl: (offers[0]?.url as string) ?? String(node.url ?? pageUrl),
        categoryHints: [],
      });
    }
  });
  return out;
}

/** Collects event detail links from listing pages using a source-specific regex. */
export function extractLinks(html: string, baseUrl: string, pattern: RegExp): string[] {
  const $ = cheerio.load(html);
  const links = new Set<string>();
  $("a[href]").each((_, a) => {
    const href = $(a).attr("href")!;
    try {
      const u = new URL(href, baseUrl);
      u.search = "";
      u.hash = "";
      if (pattern.test(u.pathname)) links.add(u.toString());
    } catch {
      /* ignore malformed */
    }
  });
  return [...links];
}

/** True when a venue only names the town ("Timișoara"), i.e. it does not identify a place. */
function isTownOnly(v: RawEvent["venue"]): boolean {
  if (v.lat != null || v.address && !/^\s*timi[sșş]oara\s*(,\s*rom[aâ]nia)?\s*$/i.test(v.address)) return false;
  return !v.name || /^\s*timi[sșş]oara\s*$/i.test(v.name);
}

/** Merges entries that describe the same event (one JSON-LD node per performance) into one event with many sessions. */
export function groupSessions(events: RawEvent[]): RawEvent[] {
  const byId = new Map<string, RawEvent>();
  for (const e of events) {
    const prev = byId.get(e.externalId);
    if (!prev) {
      byId.set(e.externalId, { ...e, sessions: [...e.sessions] });
      continue;
    }
    for (const s of e.sessions) if (!prev.sessions.some((p) => p.startsAt === s.startsAt)) prev.sessions.push(s);
  }
  for (const e of byId.values()) e.sessions.sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  return [...byId.values()];
}

export const jsonLdAdapter: SourceAdapter = {
  id: "jsonld",
  async fetch(config, ctx) {
    const sourceId = String(config.sourceId);
    const listUrls = [...((config.listUrls as string[]) ?? [])];
    // Day-by-day listings, e.g. "https://…/evenimente-timisoara/?zi={date}".
    if (config.dayListUrl) {
      const today = DateTime.fromJSDate(ctx.now, { zone: TIMEZONE }).startOf("day");
      for (let i = 0; i < Number(config.days ?? 14); i++)
        listUrls.push(String(config.dayListUrl).replace("{date}", today.plus({ days: i }).toISODate()!));
    }
    const pattern = new RegExp(String(config.linkPattern ?? ".*"));
    const exclude = config.excludePattern ? new RegExp(String(config.excludePattern)) : null;
    const excludeVenue = config.excludeVenuePattern ? new RegExp(String(config.excludeVenuePattern), "i") : null;
    const hints = (config.categoryHints as string[]) ?? [];
    const max = Number(config.maxEvents ?? 60);
    // Single-venue sources name only the hall ("Hala III"); prefixing the venue makes it identifiable.
    const prefix = config.venueNamePrefix ? String(config.venueNamePrefix) : null;

    const listed = new Map<string, RawEvent[]>(); // by url — listing entries, often date-only
    const detail = new Set<string>();
    const wanted = (u: string) => {
      try {
        const x = new URL(u);
        x.search = "";
        x.hash = "";
        return pattern.test(x.pathname) && !exclude?.test(x.toString()) ? x.toString() : null;
      } catch {
        return null;
      }
    };
    for (const listUrl of listUrls) {
      let html: string;
      try {
        html = await ctx.fetchText(listUrl, "text/html");
      } catch (e) {
        ctx.log(`jsonld: ${listUrl}: ${(e as Error).message}`);
        continue;
      }
      for (const ev of parseJsonLdEvents(html, listUrl, sourceId)) {
        const key = wanted(ev.url) ?? ev.url;
        listed.set(key, [...(listed.get(key) ?? []), ev]);
        if (wanted(ev.url)) detail.add(key);
      }
      for (const l of extractLinks(html, listUrl, pattern)) if (!exclude?.test(l)) detail.add(l);
    }

    const out: RawEvent[] = [];
    const fetched = new Set<string>();
    for (const url of [...detail].slice(0, max)) {
      try {
        const evs = parseJsonLdEvents(await ctx.fetchText(url, "text/html"), url, sourceId);
        fetched.add(url);
        // Detail pages sometimes give only the town; the listing names the actual venue.
        const listVenue = listed.get(url)?.find((l) => !isTownOnly(l.venue))?.venue;
        for (const e of evs) out.push(listVenue && isTownOnly(e.venue) ? { ...e, venue: { ...listVenue } } : e);
      } catch (e) {
        ctx.log(`jsonld: ${url}: ${(e as Error).message}`);
      }
    }
    // Listing-only entries are kept unless they point to a detail page we meant to read (their dates may be day-only).
    for (const [url, evs] of listed) if (!fetched.has(url) && !detail.has(url)) out.push(...evs);

    // "Kizomba Night @ DanceStage": when the source gives only the town, the title may name the place.
    const named = out.map((e) => {
      const at = /\s@\s+([^@]{3,60})$/.exec(e.title);
      return at && isTownOnly(e.venue)
        ? { ...e, venue: { name: at[1].trim(), address: null, locality: e.venue.locality ?? null, lat: null, lng: null } }
        : e;
    });
    return groupSessions(named)
      .filter((e) => !(excludeVenue && e.venue.name && excludeVenue.test(e.venue.name)))
      .map((e) => (prefix && !e.venue.lat ? { ...e, venue: { ...e.venue, name: e.venue.name ? `${prefix} – ${e.venue.name}` : prefix } } : e))
      .map((e) => (hints.length ? { ...e, categoryHints: [...new Set([...(e.categoryHints ?? []), ...hints])] } : e));
  },
};
