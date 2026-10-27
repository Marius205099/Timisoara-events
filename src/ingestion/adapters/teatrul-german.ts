import * as cheerio from "cheerio";
import { DateTime } from "luxon";
import { TIMEZONE } from "@/lib/config";
import type { RawEvent, SourceAdapter } from "../types";
import { detectStatusFromText, guessLocality, htmlToText } from "../text";

/**
 * Teatrul German de Stat Timișoara — public programme page (/ro/program/).
 * The page lists performances at home *and on tour*; the "în sala…/în cadrul…"
 * line tells us where each one happens. Touring dates (e.g. Oradea) are kept as
 * candidates with their real location so the geofence can reject them.
 */

const HOME_VENUE = {
  name: "Teatrul German de Stat Timișoara",
  address: "Str. Alba Iulia nr. 2, Timișoara",
  locality: "Timișoara",
};

export function parseTeatrulGermanProgram(html: string, pageUrl: string, sourceId: string): RawEvent[] {
  const $ = cheerio.load(html);
  const out: RawEvent[] = [];

  $("article.is-event").each((_, el) => {
    const art = $(el);
    const info = art.find(".box-info p.icon-text");
    const dateText = info.first().find("span").first().text(); // "Ma, 03.11.2026,"
    const dm = dateText.match(/(\d{2})\.(\d{2})\.(\d{4})/);
    if (!dm) return;
    const times = art.find(".box-info time").map((_, t) => $(t).attr("datetime")).get();
    if (!times[0]) return;
    const day = `${dm[3]}-${dm[2]}-${dm[1]}`;
    const start = DateTime.fromISO(`${day}T${times[0]}`, { zone: TIMEZONE });
    let end = times[1] ? DateTime.fromISO(`${day}T${times[1]}`, { zone: TIMEZONE }) : null;
    if (end && end < start) end = end.plus({ days: 1 });

    const texts = info.map((_, p) => $(p).text().replace(/\s+/g, " ").trim()).get();
    const ageText = texts.find((t) => /^\d{1,2}\s?\+$/.test(t)) ?? null;
    const placeText = art.find(".box-info iconify-icon[icon='lucide:map-pin']").closest("p").text().replace(/\s+/g, " ").trim();

    const anchor = art.find("h2 a").first();
    const title = htmlToText(anchor.text());
    const href = anchor.attr("href")?.trim();
    if (!title || !href) return;
    const url = new URL(href, pageUrl).toString();

    const atHome = /Teatrului German de Stat/i.test(placeText) || placeText === "";
    const venue = atHome
      ? { ...HOME_VENUE, lat: null, lng: null }
      : { name: placeText.replace(/^în (sala|cadrul)\s*/i, "") || null, address: null, locality: guessLocality(placeText), lat: null, lng: null };

    const img = art.find("img").first().attr("src");
    out.push({
      sourceId,
      externalId: url,
      url,
      title,
      description: htmlToText(art.find(".content").html() ?? "") || null,
      imageUrl: img ? new URL(img, pageUrl).toString() : null,
      kind: "scheduled",
      sessions: [{ startsAt: start.toISO()!, endsAt: end?.toISO() ?? null, allDay: false }],
      status: detectStatusFromText(title, art.find(".tags").text()) ?? "scheduled",
      attendanceMode: "offline",
      venue,
      organizer: { name: "Teatrul German de Stat Timișoara", address: "Str. Alba Iulia nr. 2, Timișoara" },
      officialAgeText: ageText,
      isFree: null,
      priceMin: null,
      priceMax: null,
      currency: null,
      ticketUrl: url,
      categoryHints: ["teatru"],
    });
  });
  return out;
}

export const teatrulGermanAdapter: SourceAdapter = {
  id: "teatrul-german",
  async fetch(config, ctx) {
    const url = String(config.url ?? "https://teatrulgerman.ro/ro/program/");
    return parseTeatrulGermanProgram(await ctx.fetchText(url, "text/html"), url, String(config.sourceId));
  },
};
