import ical, { type VEvent } from "node-ical";
import { DateTime } from "luxon";
import { TIMEZONE } from "@/lib/config";
import type { RawEvent, SourceAdapter } from "../types";
import { detectStatusFromText, htmlToText, parsePriceText, splitLocation } from "../text";

/**
 * Generic iCalendar (RFC 5545) adapter. Works with WordPress "Events Manager" /
 * "The Events Calendar" exports and any public .ics feed. Expands RRULEs.
 */

/** iCal properties are either plain strings or { val, params } objects. */
const val = (v: unknown): string | null =>
  v == null ? null : typeof v === "string" ? v : typeof v === "object" && "val" in v ? String((v as { val: unknown }).val) : String(v);

const toIso = (d: Date | undefined | null) => (d ? DateTime.fromJSDate(d).setZone(TIMEZONE).toISO() : null);

function extractTicketUrl(description: string): string | null {
  const m =
    description.match(/url="([^"]+)"[^\]]*text="(?:Cump[ăa]r[ăa] bilet|Bilete|Tickets?)"/i) ??
    description.match(/https?:\/\/(?:www\.)?(?:eventim\.ro|iabilet\.ro|bilete\.ro|entertix\.ro|eventbook\.ro|myticket\.ro)[^\s"\]]+/i);
  return m ? (m[1] ?? m[0]) : null;
}

export function parseIcs(text: string, sourceId: string, opts: { now?: Date; horizonDays?: number } = {}): RawEvent[] {
  const now = opts.now ?? new Date();
  const horizon = new Date(now.getTime() + (opts.horizonDays ?? 120) * 86400_000);
  const data = ical.sync.parseICS(text);
  const out: RawEvent[] = [];

  for (const item of Object.values(data)) {
    if (!item || item.type !== "VEVENT") continue;
    const ev = item as VEvent;
    const rawDesc = val(ev.description) ?? "";
    const title = htmlToText(val(ev.summary) ?? "");
    const location = val(ev.location);
    const loc = splitLocation(location);
    const geo = (ev as unknown as { geo?: { lat: number; lon: number } }).geo;
    const categories = ([] as string[]).concat((ev.categories as string[] | undefined) ?? []);
    const allDay = (ev.start as { dateOnly?: boolean } | undefined)?.dateOnly === true || ev.datetype === "date";

    const durationMs = ev.end && ev.start ? ev.end.getTime() - ev.start.getTime() : 0;
    let starts: Date[] = [ev.start];
    if (ev.rrule) {
      starts = ev.rrule.between(new Date(now.getTime() - 86400_000), horizon, true);
      const exdates = Object.values(ev.exdate ?? {}).map((d) => (d as Date).getTime());
      starts = starts.filter((d) => !exdates.includes(d.getTime()));
    }

    const sessions = starts
      .filter(Boolean)
      .map((s) => ({
        startsAt: toIso(s)!,
        endsAt: durationMs > 0 ? toIso(new Date(s.getTime() + durationMs)) : null,
        allDay,
      }));
    if (!sessions.length) continue;

    const statusFromIcs = ev.status === "CANCELLED" ? "canceled" : null;
    const desc = htmlToText(rawDesc);
    const officialAge = categories.find((c) => /\d+\s*\+|\+\s*\d+|ani\b/i.test(c)) ?? null;
    const price = parsePriceText(desc.match(/(?:pre[țt]|bilet|tarif)[^\n]{0,80}/i)?.[0] ?? null);

    out.push({
      sourceId,
      externalId: String(ev.uid ?? `${title}-${sessions[0].startsAt}`),
      url: val(ev.url) ?? "",
      title: title.replace(/\s+-\s+[^-]+\s+-\s+\d{1,2}\s+\S+\s+\d{2}\s+\d{1,2}:\d{2}$/, "").trim(), // "TITLE - Hall - 29 oct. 26 19:00"
      description: desc || null,
      imageUrl: val((ev as unknown as { attach?: unknown }).attach),
      kind: "scheduled",
      sessions,
      status: statusFromIcs ?? detectStatusFromText(title) ?? "scheduled",
      attendanceMode: "offline",
      venue: { name: loc.name, address: loc.address, locality: loc.locality, lat: geo?.lat ?? null, lng: geo?.lon ?? null },
      organizer: null,
      officialAgeText: officialAge,
      isFree: price.isFree,
      priceMin: price.min,
      priceMax: price.max,
      currency: price.currency,
      ticketUrl: extractTicketUrl(rawDesc),
      categoryHints: categories.filter((c) => c !== officialAge),
    });
  }
  return out;
}

export const icalAdapter: SourceAdapter = {
  id: "ical",
  async fetch(config, ctx) {
    const url = String(config.url);
    const text = await ctx.fetchText(url, "text/calendar");
    const events = parseIcs(text, String(config.sourceId), { now: ctx.now });
    // Optional per-source defaults, e.g. TNTM titles carry the hall but the organizer is the theatre.
    const organizer = config.organizer ? { name: String(config.organizer) } : null;
    return events.map((e) => ({ ...e, organizer: e.organizer ?? organizer }));
  },
};
