import type { RawEvent, SourceAdapter } from "../types";
import { localToIso } from "@/lib/dates";
import { detectStatusFromText, htmlToText, parsePriceText } from "../text";

/**
 * "The Events Calendar" (WordPress) public REST API: /wp-json/tribe/events/v1/events.
 * This is an official, documented, unauthenticated API exposed by the site owner.
 */

interface TribeVenue {
  venue?: string;
  address?: string;
  city?: string;
  zip?: string;
  country?: string;
  geo_lat?: number | string;
  geo_lng?: number | string;
}
interface TribeEvent {
  id: number;
  url: string;
  title: string;
  description?: string;
  excerpt?: string;
  start_date: string;
  end_date?: string;
  all_day?: boolean;
  timezone?: string;
  cost?: string;
  website?: string;
  image?: { url?: string } | false;
  venue?: TribeVenue | [] | false;
  organizer?: { organizer?: string }[];
  categories?: { name: string }[];
  is_virtual?: boolean;
  status?: string;
}

const num = (v: unknown) => (v === undefined || v === null || v === "" ? null : Number(v));

export function parseTribeEvents(json: { events?: TribeEvent[] }, sourceId: string, defaults: { locality?: string } = {}): RawEvent[] {
  return (json.events ?? []).map((e): RawEvent => {
    const tz = e.timezone || "Europe/Bucharest";
    const v = (Array.isArray(e.venue) || !e.venue ? {} : e.venue) as TribeVenue;
    const title = htmlToText(e.title);
    const description = htmlToText(e.description ?? e.excerpt ?? "");
    const price = parsePriceText(e.cost);
    const status = detectStatusFromText(title) ?? "scheduled";
    return {
      sourceId,
      externalId: String(e.id),
      url: e.url,
      title,
      description: description || null,
      imageUrl: e.image && typeof e.image === "object" ? e.image.url ?? null : null,
      kind: "scheduled",
      sessions: [
        {
          startsAt: localToIso(e.start_date, tz)!,
          endsAt: e.end_date ? localToIso(e.end_date, tz) : null,
          allDay: Boolean(e.all_day),
        },
      ],
      status,
      attendanceMode: e.is_virtual ? (v.venue ? "hybrid" : "online") : "offline",
      venue: {
        name: v.venue ? htmlToText(v.venue) : null,
        address: v.address ? htmlToText(v.address) : null,
        locality: v.city ?? defaults.locality ?? null,
        lat: num(v.geo_lat),
        lng: num(v.geo_lng),
      },
      organizer: e.organizer?.[0]?.organizer ? { name: htmlToText(e.organizer[0].organizer) } : null,
      officialAgeText: null,
      isFree: price.isFree,
      priceMin: price.min,
      priceMax: price.max,
      currency: price.currency,
      ticketUrl: e.website || null,
      categoryHints: (e.categories ?? []).map((c) => c.name),
    };
  });
}

export const tribeAdapter: SourceAdapter = {
  id: "tribe",
  async fetch(config, ctx) {
    const base = String(config.baseUrl).replace(/\/$/, "");
    const out: RawEvent[] = [];
    const startDate = ctx.now.toISOString().slice(0, 10);
    for (let page = 1; page <= Number(config.maxPages ?? 5); page++) {
      const url = `${base}/wp-json/tribe/events/v1/events?per_page=50&page=${page}&start_date=${startDate}`;
      let json: { events?: TribeEvent[]; total_pages?: number };
      try {
        json = JSON.parse(await ctx.fetchText(url, "application/json"));
      } catch (e) {
        if (page > 1) break; // tribe returns 400 past the last page
        throw e;
      }
      out.push(...parseTribeEvents(json, String(config.sourceId), { locality: config.defaultLocality as string | undefined }));
      if (!json.total_pages || page >= json.total_pages) break;
    }
    // Venues often omit the city: the organizer's city is NOT used; we only add a locality
    // hint for geocoding when the source is configured with one, and the geocoder still verifies it.
    return out;
  },
};
