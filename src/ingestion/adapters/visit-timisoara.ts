import { DateTime } from "luxon";
import { TIMEZONE } from "@/lib/config";
import type { RawEvent, SourceAdapter } from "../types";
import { matchKnownVenue } from "../known-venues";
import { detectStatusFromText, htmlToText } from "../text";
import { parseJsonLdEvents } from "./jsonld";

/**
 * visit-timisoara.com — the City of Timișoara's official tourism portal (Destination Management
 * Organisation of Primăria Timișoara). Public WordPress REST API: /wp-json/wp/v2/events-visit.
 * The records carry date, time and links but no venue: the venue is taken from the event's ticket
 * page when that page publishes schema.org Event data, or from the verified venue registry when the
 * title names a known venue. Otherwise the venue stays unknown and the event goes to review.
 */

interface VisitEvent {
  id: number;
  link: string;
  title: { rendered: string };
  class_list?: string[];
  meta: {
    subtitle?: string;
    short_description?: string;
    long_description?: string;
    link_website_event?: string;
    link_tickets_event?: string;
    link_registration_event_?: string;
    tip_desfasurare?: string;
    type_of_access?: string;
    starting_date?: number | string;
    ending_date?: number | string;
    starting_time?: string;
    ending_time?: string;
  };
}

const TYPE_HINTS: Record<string, string> = {
  "concert-ro": "concert",
  "spectacol-ro": "teatru",
  expozitie: "expozitie",
  "festival-ro": "festival",
  atelier: "atelier",
  "proiectie-de-film": "film",
  conferinta: "conferinta",
  "tur-ghidat": "tur",
  targ: "targ",
  "lansare-carte": "carte",
};

/** The portal stores the calendar day as a UTC-midnight timestamp and the time as "HH:mm". */
function dayFromTs(ts: number | string | undefined): DateTime | null {
  const n = Number(ts);
  if (!Number.isFinite(n) || n <= 0) return null;
  const d = DateTime.fromSeconds(n, { zone: "utc" });
  return DateTime.fromObject({ year: d.year, month: d.month, day: d.day }, { zone: TIMEZONE });
}

function withTime(day: DateTime, time: string | undefined): DateTime | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec((time ?? "").trim());
  return m ? day.set({ hour: Number(m[1]), minute: Number(m[2]) }) : null;
}

export function parseVisitEvent(e: VisitEvent, sourceId: string): RawEvent | null {
  const m = e.meta ?? {};
  const day = dayFromTs(m.starting_date);
  if (!day) return null;
  const endDay = dayFromTs(m.ending_date);
  const start = withTime(day, m.starting_time);
  // A span of several days (exhibitions, festivals) is one all-day session over the whole range;
  // a night event ending the next day keeps its start time.
  const multiDay = endDay && endDay.diff(day, "days").days > 1;
  const end = endDay ? withTime(endDay, m.ending_time) ?? (multiDay ? endDay.endOf("day") : null) : null;
  const title = htmlToText(e.title?.rendered);
  const description = htmlToText([m.short_description, m.long_description].filter(Boolean).join("\n")) || null;
  const types = (e.class_list ?? []).filter((c) => c.startsWith("event-type-")).map((c) => c.slice("event-type-".length));
  const known = matchKnownVenue(title) ?? matchKnownVenue(m.subtitle);

  return {
    sourceId,
    externalId: String(e.id),
    url: e.link,
    title,
    description,
    imageUrl: null,
    kind: "scheduled",
    sessions: [
      {
        startsAt: (start && !multiDay ? start : day).toISO()!,
        endsAt: end && end > (start ?? day) ? end.toISO() : null,
        allDay: Boolean(multiDay || !start),
      },
    ],
    status: detectStatusFromText(title) ?? "scheduled",
    attendanceMode: /online/i.test(m.tip_desfasurare ?? "") ? "online" : "offline",
    venue: known ? { name: known.name, address: known.address, locality: known.locality } : { name: null, address: null, locality: null },
    organizer: null,
    officialAgeText: null,
    isFree: /gratuit|liber|free/i.test(m.type_of_access ?? "") ? true : null,
    priceMin: null,
    priceMax: null,
    currency: null,
    ticketUrl: m.link_tickets_event || m.link_registration_event_ || m.link_website_event || null,
    categoryHints: types.map((t) => TYPE_HINTS[t]).filter(Boolean),
  };
}

/** Links worth reading for venue data: not social networks (they forbid automated access). */
const followable = (u: string | null | undefined) => !!u && /^https?:\/\//.test(u) && !/facebook\.com|fb\.me|instagram\.com|tiktok\.com/i.test(u);

export const visitTimisoaraAdapter: SourceAdapter = {
  id: "visit-timisoara",
  async fetch(config, ctx) {
    const sourceId = String(config.sourceId);
    const base = String(config.baseUrl ?? "https://visit-timisoara.com").replace(/\/$/, "");
    const today = DateTime.fromJSDate(ctx.now, { zone: TIMEZONE }).startOf("day");
    const out: RawEvent[] = [];
    for (let page = 1; page <= Number(config.maxPages ?? 3); page++) {
      const url = `${base}/wp-json/wp/v2/events-visit?per_page=100&page=${page}&orderby=date&order=desc`;
      let items: VisitEvent[];
      try {
        items = JSON.parse(await ctx.fetchText(url, "application/json"));
      } catch (e) {
        if (page > 1) break;
        throw e;
      }
      for (const it of items) {
        if (!/\/ro\//.test(it.link)) continue; // Romanian records only; the English ones are translations
        const ev = parseVisitEvent(it, sourceId);
        if (!ev) continue;
        const last = DateTime.fromISO(ev.sessions[0].endsAt ?? ev.sessions[0].startsAt);
        if (last < today) continue;
        out.push(ev);
      }
      if (items.length < 100) break;
    }

    // Venue from the ticket / event page's own schema.org data.
    let follows = Number(config.maxFollow ?? 40);
    for (const ev of out) {
      if (ev.venue.name || follows <= 0 || !followable(ev.ticketUrl)) continue;
      follows--;
      try {
        const found = parseJsonLdEvents(await ctx.fetchText(ev.ticketUrl!, "text/html"), ev.ticketUrl!, sourceId).find(
          (x) => x.venue.name || x.venue.address,
        );
        if (found) ev.venue = { ...found.venue };
      } catch (e) {
        ctx.log(`visit-timisoara: ${ev.ticketUrl}: ${(e as Error).message}`);
      }
    }
    return out;
  },
};
