import * as cheerio from "cheerio";
import { DateTime } from "luxon";
import { TIMEZONE } from "@/lib/config";
import type { RawEvent, SourceAdapter } from "../types";
import { KNOWN_VENUES, type KnownVenue } from "../known-venues";
import { findDateMentions, findTime, toSession } from "../ro-dates";
import { detectStatusFromText, guessLocality, htmlToText, truncate } from "../text";

/**
 * Local press (RSS feeds of culture / leisure sections). Newspapers publish articles, not
 * structured agendas, so an article becomes an event ONLY when, deterministically:
 *   - it reads as an event announcement (keywords in the title or lead),
 *   - its lead mentions exactly ONE future date (or one date range) within 120 days,
 *   - its lead names a place: a venue from the verified registry, or a named place
 *     ("la Sala Olimpia din Timișoara") that the geocoder must then locate precisely.
 * Anything ambiguous is skipped. The 50 km check, publication rules and cross-source
 * duplicate merge (same place and time as an event from another source) still apply.
 */

const EVENT_WORDS =
  /\b(concert\w*|spectacol\w*|expozi[tț]i\w*|festival\w*|t[aâ]rg\w*|atelier\w*|workshop\w*|lansare\w*|recital\w*|premier[aăe]\w*|vernisaj\w*|pies[aă]|teatru\w*|stand-?up|proiec[tț]i\w*|conferin[tț]\w*|maraton\w*|carnaval\w*|petrecere|party|degust[aă]ri?\w*|tur(?:ul)? ghidat|parad[aă]|show|oper[aăe]|operet[aă]|balet\w*|musical\w*|gal[aă]|bal\w*|caravan[aă]|t[aâ]rgul|fest|serat[aă]|lectur[aă]|seminar|dezbatere|cinema|film\w*|meci\w*|cros|ziua\s+\w+|s[aă]rb[aă]toare\w*)\b/iu;

const ROUNDUP = /^(ce facem|ce faci|agenda|programul|ghid|top \d|unde ie[sș]im|weekend(ul)? (în|la|cu))|\bce (facem|putem face) (azi|astăzi|mâine|în weekend)/iu;

const PLACE_HEAD =
  /^(Sala|Teatrul|Muzeul|Casa|Parcul|Pia[tț]a|Centrul|Galeria|Biserica|Catedrala|Cinema|Cinematograful|Clubul|Club|Hala|Bastionul|Castelul|Universitatea|Biblioteca|Filarmonica|Opera|Stadionul|Arena|Palatul|Gr[aă]dina|Cetatea|Aula|Ateneul|Complexul|Muzeului|Iulius|Shopping|Cl[aă]direa|Restaurantul|Hotel|Hotelul|Pub|Caf[eé]|Cafeneaua|Sinagoga|Mansarda|Faber|FABER|Ambasada|Scena|Rotonda|Gr[aă]dinii)$/u;
const CONNECTORS = new Set(["de", "din", "al", "a", "lui", "și", "si", "pentru", "nr.", "nr", "-", "–"]);

const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** First locality named in the text, by position (guessLocality alone prefers its own list order). */
export function firstLocality(text: string): string | null {
  const words = text.split(/\s+/);
  for (let i = 0; i < words.length; i++) {
    const hit = guessLocality(words.slice(i, i + 3).join(" "));
    if (hit) return hit;
  }
  return null;
}

/** Venues from the verified registry whose name or alias appears in the text, in text order. */
export function findKnownVenuesInText(text: string, venues: KnownVenue[] = KNOWN_VENUES): KnownVenue[] {
  const t = ` ${fold(text).replace(/[„”"'’.,;:()!?]/g, " ").replace(/\s+/g, " ")} `;
  const hits = new Map<string, { v: KnownVenue; at: number }>();
  for (const v of venues)
    for (const a of [v.name, ...v.aliases]) {
      const na = fold(a).replace(/[„”"'’.,;:()]/g, " ").replace(/\s+/g, " ").trim();
      if (na.length < 8) continue;
      const at = t.indexOf(` ${na} `);
      if (at >= 0 && (!hits.has(v.key) || at < hits.get(v.key)!.at)) hits.set(v.key, { v, at });
    }
  return [...hits.values()].sort((a, b) => a.at - b.at).map((h) => h.v);
}

/** "la Sala Olimpia din Timișoara" → "Sala Olimpia" (capitalised place name after la/în/pe scena). */
export function findNamedPlaces(text: string): { name: string; after: string }[] {
  const found: { name: string; after: string }[] = [];
  // \b is ASCII-only in JS regexps: it never matches before "în", so use a letter lookbehind.
  const re = /(?<!\p{L})(?:la|[iî]n|pe scena|[iî]n curtea|[iî]n sala)\s+((?:[„"]?)[A-ZĂÂÎȘȚ][\p{L}’'-]*)/gu;
  for (const m of text.matchAll(re)) {
    const head = m[1].replace(/^[„"]/, "")
    if (!PLACE_HEAD.test(head)) continue;
    const rest = text.slice(m.index! + m[0].length).trimStart().split(/\s+/);
    const parts = [head];
    for (const w of rest) {
      const clean = w.replace(/[,.;:)!?]+$/, "");
      if (!clean) break;
      if (/^[„"]?[A-ZĂÂÎȘȚ0-9]/u.test(clean) || CONNECTORS.has(clean.toLowerCase())) parts.push(clean.replace(/^[„"]|[”"]$/g, ""));
      else break;
      if (clean !== w) break; // punctuation ends the name
      if (parts.length >= 7) break;
    }
    while (parts.length && CONNECTORS.has(parts.at(-1)!.toLowerCase())) parts.pop();
    // "Sala Capitol din Timișoara": the town is not part of the venue name.
    const idx = parts.findIndex((p, i) => {
      const tail = parts.slice(i + 1).join(" ");
      return i > 0 && (p === "din" || p === "de") && fold(guessLocality(tail) ?? "") === fold(tail);
    });
    const name = (idx > 0 ? parts.slice(0, idx) : parts).join(" ");
    if (name.split(" ").length < 2 && !/^(Faber|FABER)$/.test(name)) continue;
    if (!found.some((f) => fold(f.name) === fold(name))) found.push({ name, after: text.slice(m.index!, m.index! + m[0].length + 120) });
  }
  return found;
}

export interface Article {
  url: string;
  title: string;
  text: string;
  publishedAt: DateTime | null;
}

export function extractPressEvent(a: Article, sourceId: string, now: DateTime, opts: { defaultLocality?: string | null; leadChars?: number } = {}): RawEvent | null {
  if (a.publishedAt && a.publishedAt < now.minus({ days: 45 })) return null;
  // Many newsrooms still type the cedilla letters (ş ţ); the rules below use the comma ones.
  const lead = `${a.title}. ${a.text}`.slice(0, opts.leadChars ?? 1500).replace(/ş/g, "ș").replace(/Ş/g, "Ș").replace(/ţ/g, "ț").replace(/Ţ/g, "Ț");
  if (!EVENT_WORDS.test(lead)) return null;
  if (/\b(a avut loc|s-a desf[aă][sș]urat|au participat|a fost organizat)\b/i.test(lead.slice(0, 400))) return null; // reports, not announcements

  const today = now.startOf("day");
  const future = findDateMentions(lead, now).filter((d) => (d.end ?? d.start) >= today && d.start <= today.plus({ days: 120 }));
  const distinct = new Map(future.map((d) => [`${d.start.toISODate()}|${d.end?.toISODate() ?? ""}`, d]));
  if (distinct.size !== 1) return null; // none, or a programme of several dates: ambiguous
  const date = [...distinct.values()][0];
  const time = findTime(lead.slice(Math.max(0, date.index - 160), date.index + date.length + 160));

  // Daily agendas and programmes list many events: not one event.
  if (ROUNDUP.test(a.title) || new Set(lead.match(/\b\d{1,2}[:.]\d{2}\b/g) ?? []).size >= 3) return null;

  // Exactly one place: an article spanning several venues cannot be pinned to one of them.
  const knownAll = findKnownVenuesInText(lead);
  const namedAll = findNamedPlaces(lead).filter((p) => !knownAll.some((k) => findKnownVenuesInText(p.name, [k]).length));
  if (knownAll.length + namedAll.length !== 1) return null;
  const named = namedAll[0] ?? null;
  const known = knownAll[0] ?? null;
  const locality = (named && firstLocality(named.after)) ?? firstLocality(lead) ?? opts.defaultLocality ?? null;
  const venue =
    known && (!locality || fold(locality) === fold(known.locality))
      ? { name: known.name, address: known.address, locality: known.locality }
      : named && locality
        ? { name: named.name, address: null, locality }
        : null;
  if (!venue) return null;

  const title = truncate(a.title.replace(/\s*[|–-]\s*(TION|Pressalert|Opinia Timi[sș]oarei|Banatul Meu|De Banat|Ziua de Vest|Timi[sș] Plus)\s*$/i, "").trim(), 140);
  return {
    sourceId,
    externalId: a.url,
    url: a.url,
    title,
    description: truncate(a.text, 500) || null,
    imageUrl: null,
    kind: "scheduled",
    sessions: [toSession(date, time)],
    status: detectStatusFromText(a.title) ?? "scheduled",
    attendanceMode: "offline",
    venue,
    organizer: null,
    officialAgeText: null,
    isFree: /\b(intrare(a)? (este )?liber[aă]|acces(ul)? (este )?(gratuit|liber)|gratuit)\b/i.test(lead) ? true : null,
    priceMin: null,
    priceMax: null,
    currency: null,
    ticketUrl: null,
    categoryHints: [],
  };
}

/** Items of an RSS 2.0 feed, with the full text when the feed carries it. */
export function parseRss(xml: string): { url: string; title: string; html: string; publishedAt: DateTime | null }[] {
  const $ = cheerio.load(xml, { xmlMode: true });
  return $("item")
    .toArray()
    .map((it) => {
      const $it = $(it);
      const pub = $it.find("pubDate").first().text();
      const d = pub ? DateTime.fromRFC2822(pub.trim(), { zone: TIMEZONE }) : null;
      return {
        url: $it.find("link").first().text().trim(),
        title: htmlToText($it.find("title").first().text()),
        html: $it.find("content\\:encoded").first().text() || $it.find("description").first().text(),
        publishedAt: d?.isValid ? d : null,
      };
    })
    .filter((x) => x.url && x.title);
}

/** The article body of a news page: the usual WordPress / CMS containers, else all paragraphs. */
export function articleText(html: string): string {
  const $ = cheerio.load(html);
  $("script, style, aside, nav, footer, header, form, .share, .related, .comments").remove();
  for (const sel of ["[itemprop=articleBody]", ".entry-content", ".post-content", ".article-content", ".td-post-content", ".single-content", "article"]) {
    const el = $(sel).first();
    const t = el.length ? el.find("p").toArray().map((p) => $(p).text().trim()).filter(Boolean).join("\n") : "";
    if (t.length > 200) return t;
  }
  return $("p").toArray().map((p) => $(p).text().trim()).filter(Boolean).join("\n");
}

export const pressAdapter: SourceAdapter = {
  id: "press",
  async fetch(config, ctx) {
    const sourceId = String(config.sourceId);
    const now = DateTime.fromJSDate(ctx.now, { zone: TIMEZONE });
    const feeds = (config.feeds as string[]) ?? [];
    const defaultLocality = (config.defaultLocality as string | undefined) ?? null;
    const seen = new Set<string>();
    const out: RawEvent[] = [];
    let pages = Number(config.maxArticles ?? 30);
    for (const feed of feeds) {
      let items: ReturnType<typeof parseRss>;
      try {
        items = parseRss(await ctx.fetchText(feed, "application/rss+xml"));
      } catch (e) {
        ctx.log(`press: ${feed}: ${(e as Error).message}`);
        continue;
      }
      for (const it of items) {
        if (seen.has(it.url)) continue;
        seen.add(it.url);
        if (it.publishedAt && it.publishedAt < now.minus({ days: 45 })) continue;
        let text = htmlToText(it.html);
        // Feeds often carry only an excerpt; read the article when it could be an event.
        if (text.length < 400 && EVENT_WORDS.test(`${it.title} ${text}`) && pages > 0) {
          pages--;
          try {
            text = articleText(await ctx.fetchText(it.url, "text/html")) || text;
          } catch (e) {
            ctx.log(`press: ${it.url}: ${(e as Error).message}`);
          }
        }
        const ev = extractPressEvent({ url: it.url, title: it.title, text, publishedAt: it.publishedAt }, sourceId, now, { defaultLocality });
        if (ev) out.push(ev);
      }
    }
    return out;
  },
};
