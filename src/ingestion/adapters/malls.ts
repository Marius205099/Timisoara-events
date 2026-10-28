import * as cheerio from "cheerio";
import { DateTime } from "luxon";
import { TIMEZONE } from "@/lib/config";
import type { RawEvent, SourceAdapter } from "../types";
import { findDateMentions, findTime, toSession, type DateMention } from "../ro-dates";
import { detectStatusFromText, htmlToText, truncate } from "../text";

/**
 * Shopping centres. Their event pages are public; the venue is the mall itself (verified
 * coordinates in the venue registry), so only dates need reading.
 */

const MALL_VENUE = {
  iulius: { name: "Iulius Town", address: "Piața Consiliul Europei nr. 2, Timișoara", locality: "Timișoara" },
  shoppingcity: { name: "Shopping City Timișoara", address: "Calea Șagului nr. 100, Timișoara", locality: "Timișoara" },
};

/** Store campaigns ("access with dogs", seasonal sales) are not events: they run for months. */
const MAX_SPAN_DAYS = 31;

const pageText = (html: string) => {
  const $ = cheerio.load(html);
  $("script, style, svg, nav, header, footer").remove();
  return htmlToText($("body").html() ?? "");
};
const ogDescription = (html: string) => cheerio.load(html)('meta[property="og:description"]').attr("content") ?? null;

// ---------------------------------------------------------------------------
// Iulius Town — listing shows "31 octombrie", "26 - 30 octombrie", "Duminică, ora 12:00"
// ---------------------------------------------------------------------------
export interface IuliusListItem {
  url: string;
  title: string;
  dateText: string;
}

export function parseIuliusList(html: string, baseUrl: string): IuliusListItem[] {
  const $ = cheerio.load(html);
  const out: IuliusListItem[] = [];
  $(".continut-eveniment").each((_, el) => {
    const a = $(el).find(".titlu-eveniment a").first();
    const href = a.attr("href");
    if (!href) return;
    out.push({ url: new URL(href, baseUrl).toString(), title: htmlToText(a.text()), dateText: htmlToText($(el).find(".data-eveniment").text()) });
  });
  return out;
}

/**
 * Sessions of one Iulius event. A weekly series ("Duminică, ora 12:00") is resolved from the
 * dated programme lines on its page ("1 noiembrie – Hansel și Gretel"); a range is one all-day
 * session; open-ended ("din 12 mai 2026") or undated items give none.
 */
export function iuliusSessions(item: IuliusListItem, detailText: string, now: DateTime): RawEvent["sessions"] {
  const time = findTime(detailText) ?? findTime(item.dateText);
  if (/^\s*din\s/i.test(item.dateText)) return [];
  const listed = findDateMentions(item.dateText, now);
  let mentions: DateMention[] = listed;
  if (!listed.length) {
    if (!/\bora\b/i.test(item.dateText)) return [];
    const seen = new Set<string>();
    mentions = findDateMentions(detailText, now).filter((m) => !m.end && !seen.has(m.start.toISODate()!) && seen.add(m.start.toISODate()!));
  }
  return mentions
    .filter((m) => !m.end || m.end.diff(m.start, "days").days <= MAX_SPAN_DAYS)
    .map((m) => toSession(m, m.end ? null : time));
}

// ---------------------------------------------------------------------------
// Shopping City Timișoara — Next.js page data: events.eventsData[] with ISO start/end
// ---------------------------------------------------------------------------
interface ScEvent {
  id: number;
  name: string;
  slug: string;
  startDate: string;
  endDate?: string | null;
}

export function parseShoppingCityList(html: string): ScEvent[] {
  const m = /<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/.exec(html);
  if (!m) return [];
  const data = JSON.parse(m[1]);
  return (data?.props?.pageProps?.events?.eventsData ?? []) as ScEvent[];
}

export function shoppingCitySession(e: ScEvent): RawEvent["sessions"][number] | null {
  const s = DateTime.fromISO(e.startDate, { zone: "utc" }).setZone(TIMEZONE);
  const end = e.endDate ? DateTime.fromISO(e.endDate, { zone: "utc" }).setZone(TIMEZONE) : null;
  if (!s.isValid) return null;
  if (end && end.diff(s, "days").days > MAX_SPAN_DAYS) return null;
  if (end && !end.hasSame(s, "day")) return { startsAt: s.startOf("day").toISO()!, endsAt: end.endOf("day").toISO()!, allDay: true };
  return { startsAt: s.toISO()!, endsAt: end?.toISO() ?? null, allDay: false };
}

function mallEvent(sourceId: string, mall: keyof typeof MALL_VENUE, url: string, title: string, description: string | null, sessions: RawEvent["sessions"]): RawEvent {
  return {
    sourceId,
    externalId: url,
    url,
    title,
    description: description ? truncate(description, 600) : null,
    imageUrl: null,
    kind: "scheduled",
    sessions,
    status: detectStatusFromText(title) ?? "scheduled",
    attendanceMode: "offline",
    venue: { ...MALL_VENUE[mall] },
    organizer: { name: MALL_VENUE[mall].name },
    officialAgeText: null,
    isFree: /gratuit|acces liber|intrare liber/i.test(description ?? "") ? true : null,
    priceMin: null,
    priceMax: null,
    currency: null,
    ticketUrl: url,
    categoryHints: [],
  };
}

export const mallAdapter: SourceAdapter = {
  id: "mall",
  async fetch(config, ctx) {
    const sourceId = String(config.sourceId);
    const mall = String(config.mall) as keyof typeof MALL_VENUE;
    const listUrl = String(config.listUrl);
    const now = DateTime.fromJSDate(ctx.now, { zone: TIMEZONE });
    const html = await ctx.fetchText(listUrl, "text/html");
    const out: RawEvent[] = [];

    if (mall === "iulius") {
      for (const item of parseIuliusList(html, listUrl).slice(0, Number(config.maxEvents ?? 40))) {
        // Past items stay on the listing for months: skip them without fetching their page.
        const listed = findDateMentions(item.dateText, now);
        const last = listed.length ? (listed.at(-1)!.end ?? listed.at(-1)!.start) : null;
        if (last && last < now.startOf("day")) continue;
        if (/^\s*din\s/i.test(item.dateText) || !item.dateText) continue;
        try {
          const page = await ctx.fetchText(item.url, "text/html");
          const text = pageText(page);
          const sessions = iuliusSessions(item, text, now);
          if (sessions.length) out.push(mallEvent(sourceId, mall, item.url, item.title, ogDescription(page), sessions));
        } catch (e) {
          ctx.log(`iulius: ${item.url}: ${(e as Error).message}`);
        }
      }
    } else {
      const base = new URL(listUrl);
      for (const e of parseShoppingCityList(html)) {
        const session = shoppingCitySession(e);
        if (!session) continue;
        if (DateTime.fromISO(session.endsAt ?? session.startsAt) < now.startOf("day")) continue;
        const url = new URL(`${base.pathname.replace(/\/$/, "")}/${e.slug}`, base).toString();
        let description: string | null = null;
        try {
          description = ogDescription(await ctx.fetchText(url, "text/html"));
        } catch (err) {
          ctx.log(`shoppingcity: ${url}: ${(err as Error).message}`);
        }
        out.push(mallEvent(sourceId, mall, url, htmlToText(e.name).trim(), description, [session]));
      }
    }
    return out;
  },
};
