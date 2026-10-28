import { DateTime } from "luxon";
import { TIMEZONE } from "@/lib/config";

/**
 * Romanian free-text dates as written by venues and newspapers:
 * "31 octombrie", "26 - 30 octombrie", "9 octombrie - 1 noiembrie", "1 noiembrie 2026", "ora 19:00".
 */

const MONTHS: [RegExp, number][] = [
  [/^ian/, 1], [/^feb/, 2], [/^mar[tț]/, 3], [/^apr/, 4], [/^mai/, 5], [/^iun/, 6],
  [/^iul/, 7], [/^aug/, 8], [/^sep/, 9], [/^oct/, 10], [/^noi/, 11], [/^dec/, 12],
];
const MONTH_WORD = "(ianuarie|februarie|martie|aprilie|mai|iunie|iulie|august|septembrie|octombrie|noiembrie|decembrie|ian\\.?|feb\\.?|mar\\.?|apr\\.?|iun\\.?|iul\\.?|aug\\.?|sept?\\.?|oct\\.?|noi\\.?|nov\\.?|dec\\.?)";

const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export function monthNumber(word: string): number | null {
  const w = fold(word);
  if (/^nov/.test(w)) return 11;
  return MONTHS.find(([re]) => re.test(w))?.[1] ?? null;
}

/** Resolves a day and month to a date, inferring the year when the text gives none. */
export function withYear(day: number, month: number, year: number | null, now: DateTime): DateTime | null {
  const make = (y: number) => DateTime.fromObject({ year: y, month, day }, { zone: TIMEZONE });
  if (year) {
    const d = make(year);
    return d.isValid ? d : null;
  }
  // The occurrence closest to today: "22 august" read in October is the past August (and is
  // then skipped as past), "5 ianuarie" read in December is next January.
  const options = [now.year - 1, now.year, now.year + 1].map(make).filter((d) => d.isValid);
  if (!options.length) return null;
  return options.reduce((a, b) => (Math.abs(b.diff(now).toMillis()) < Math.abs(a.diff(now).toMillis()) ? b : a));
}

export interface DateMention {
  start: DateTime;
  end: DateTime | null; // last day of a range
  index: number; // position in the text
  length: number;
}

/** Every "D luna", "D - D luna" and "D luna - D luna" mention, in text order. */
export function findDateMentions(text: string, now: DateTime): DateMention[] {
  const out: DateMention[] = [];
  const re = new RegExp(
    `\\b(\\d{1,2})(?:\\s+${MONTH_WORD})?(?:\\s+(\\d{4}))?\\s*(?:[-–—]|p[aâ]n[aă]\\s+(?:pe|[iî]n|la)?)\\s*(\\d{1,2})\\s+${MONTH_WORD}(?:\\s+(\\d{4}))?\\b|\\b(\\d{1,2})\\s+${MONTH_WORD}(?:,?\\s+(\\d{4}))?\\b`,
    "giu",
  );
  for (const m of text.matchAll(re)) {
    if (m[4]) {
      // range
      const m2 = monthNumber(m[5]);
      const m1 = m[2] ? monthNumber(m[2]) : m2;
      if (!m1 || !m2) continue;
      const y2 = m[6] ? Number(m[6]) : null;
      const end = withYear(Number(m[4]), m2, y2, now);
      if (!end) continue;
      let start = withYear(Number(m[1]), m1, m[3] ? Number(m[3]) : y2 ?? end.year, now);
      if (start && start > end) start = start.minus({ years: 1 });
      if (!start || end.diff(start, "days").days > 366) continue;
      out.push({ start, end, index: m.index!, length: m[0].length });
    } else {
      const mo = monthNumber(m[8]);
      if (!mo) continue;
      const start = withYear(Number(m[7]), mo, m[9] ? Number(m[9]) : null, now);
      if (start) out.push({ start, end: null, index: m.index!, length: m[0].length });
    }
  }
  return out;
}

export interface TimeOfDay {
  start: { hour: number; minute: number };
  end: { hour: number; minute: number } | null;
}

/** "ora 19:00", "de la ora 18", "19:00 - 21:00", "între orele 10.00-13.00". */
export function findTime(text: string): TimeOfDay | null {
  const ok = (h: number, m: number) => h >= 0 && h <= 23 && m >= 0 && m <= 59;
  const range = /\b(\d{1,2})[:.](\d{2})\s*(?:[-–—]|p[aâ]n[aă]\s+la)\s*(\d{1,2})[:.](\d{2})\b/iu.exec(text);
  if (range && ok(+range[1], +range[2]) && ok(+range[3], +range[4]))
    return { start: { hour: +range[1], minute: +range[2] }, end: { hour: +range[3], minute: +range[4] } };
  const ora = /\b(?:ora|orele|la ora|de la ora|[iî]ncep[aâ]nd cu ora)\s+(\d{1,2})(?:[:.](\d{2}))?\b/iu.exec(text);
  if (ora && ok(+ora[1], +(ora[2] ?? 0))) return { start: { hour: +ora[1], minute: +(ora[2] ?? 0) }, end: null };
  const hhmm = /(?:^|[\s,(])(\d{1,2}):(\d{2})\b/.exec(text);
  if (hhmm && ok(+hhmm[1], +hhmm[2])) return { start: { hour: +hhmm[1], minute: +hhmm[2] }, end: null };
  return null;
}

/** A session from a date mention and an optional time: a range of days is one all-day session. */
export function toSession(d: DateMention, time: TimeOfDay | null): { startsAt: string; endsAt: string | null; allDay: boolean } {
  if (d.end && d.end > d.start) return { startsAt: d.start.toISO()!, endsAt: d.end.endOf("day").toISO()!, allDay: true };
  if (!time) return { startsAt: d.start.toISO()!, endsAt: null, allDay: true };
  const s = d.start.set(time.start);
  let e = time.end ? d.start.set(time.end) : null;
  if (e && e <= s) e = e.plus({ days: 1 }); // "20:00 – 04:00"
  return { startsAt: s.toISO()!, endsAt: e?.toISO() ?? null, allDay: false };
}
