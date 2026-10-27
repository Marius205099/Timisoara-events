import { DateTime } from "luxon";
import { TIMEZONE } from "./config";

/**
 * All calendar math happens in Europe/Bucharest. Luxon applies the IANA rules, so
 * days that are 23 h or 25 h long (DST switches) are handled correctly.
 */

export type QuickDate = "azi" | "maine" | "sambata" | "duminica" | "weekend" | "7zile" | "data";

export const QUICK_DATES: { id: Exclude<QuickDate, "data">; label: string }[] = [
  { id: "azi", label: "Azi" },
  { id: "maine", label: "Mâine" },
  { id: "sambata", label: "Sâmbătă" },
  { id: "duminica", label: "Duminică" },
  { id: "weekend", label: "Weekend" },
];

export interface DateRange {
  from: DateTime;
  to: DateTime;
  label: string;
}

export function nowInBucharest(now?: Date | string): DateTime {
  const base = now ? DateTime.fromJSDate(typeof now === "string" ? new Date(now) : now) : DateTime.now();
  return base.setZone(TIMEZONE);
}

const dayRange = (d: DateTime) => ({ from: d.startOf("day"), to: d.endOf("day") });

/** Next occurrence of an ISO weekday (6 = Saturday, 7 = Sunday), today included. */
function nextWeekday(today: DateTime, weekday: number): DateTime {
  const diff = (weekday - today.weekday + 7) % 7;
  return today.plus({ days: diff }).startOf("day");
}

export function formatDayLabel(d: DateTime): string {
  return d.setLocale("ro").toFormat("cccc, d LLLL");
}

export function resolveDateRange(q: QuickDate, opts: { now?: Date | string; date?: string } = {}): DateRange {
  const today = nowInBucharest(opts.now).startOf("day");
  switch (q) {
    case "azi":
      return { ...dayRange(today), label: `Azi, ${formatDayLabel(today)}` };
    case "maine": {
      const d = today.plus({ days: 1 });
      return { ...dayRange(d), label: `Mâine, ${formatDayLabel(d)}` };
    }
    case "sambata": {
      const d = nextWeekday(today, 6);
      return { ...dayRange(d), label: capitalize(formatDayLabel(d)) };
    }
    case "duminica": {
      const d = nextWeekday(today, 7);
      return { ...dayRange(d), label: capitalize(formatDayLabel(d)) };
    }
    case "weekend": {
      // On Sunday the "weekend" is just today; otherwise the coming Saturday + Sunday.
      const sat = today.weekday === 7 ? today : nextWeekday(today, 6);
      const sun = nextWeekday(today, 7);
      return {
        from: sat.startOf("day"),
        to: sun.endOf("day"),
        label: sat.hasSame(sun, "day")
          ? `Weekend: ${sun.setLocale("ro").toFormat("d LLLL")}`
          : `Weekend: ${sat.setLocale("ro").toFormat(sat.hasSame(sun, "month") ? "d" : "d LLLL")} – ${sun.setLocale("ro").toFormat("d LLLL")}`,
      };
    }
    case "data": {
      const d = opts.date ? DateTime.fromISO(opts.date, { zone: TIMEZONE }) : today;
      const day = d.isValid ? d.startOf("day") : today;
      return { ...dayRange(day), label: capitalize(formatDayLabel(day)) };
    }
    case "7zile":
    default:
      return { from: today, to: today.plus({ days: 6 }).endOf("day"), label: "Următoarele 7 zile" };
  }
}

export type TimeOfDay = "morning" | "afternoon" | "evening";
export const TIME_OF_DAY: { id: TimeOfDay; label: string }[] = [
  { id: "morning", label: "Dimineața" },
  { id: "afternoon", label: "După-amiaza" },
  { id: "evening", label: "Seara" },
];

/** morning 05–12, afternoon 12–18, evening 18–05 (local Bucharest time). */
export function timeOfDayOf(iso: string): TimeOfDay {
  const h = DateTime.fromISO(iso, { setZone: true }).setZone(TIMEZONE).hour;
  if (h >= 5 && h < 12) return "morning";
  if (h >= 12 && h < 18) return "afternoon";
  return "evening";
}

/** Converts a naive local wall-clock time (as published by Romanian sources) to an ISO string with offset. */
export function localToIso(local: string, zone = TIMEZONE): string | null {
  const d = DateTime.fromISO(local.replace(" ", "T"), { zone });
  return d.isValid ? d.toISO() : null;
}

export function formatSessionRo(startIso: string, endIso?: string | null, allDay = false): string {
  const s = DateTime.fromISO(startIso, { setZone: true }).setZone(TIMEZONE).setLocale("ro");
  if (allDay) return capitalize(s.toFormat("cccc, d LLLL"));
  let out = capitalize(s.toFormat("ccc, d LLL, HH:mm"));
  if (endIso) {
    const e = DateTime.fromISO(endIso, { setZone: true }).setZone(TIMEZONE).setLocale("ro");
    out += e.hasSame(s, "day") ? `–${e.toFormat("HH:mm")}` : ` – ${e.toFormat("d LLL, HH:mm")}`;
  }
  return out;
}

export function formatDateRo(iso: string): string {
  return DateTime.fromISO(iso, { setZone: true }).setZone(TIMEZONE).setLocale("ro").toFormat("d LLLL yyyy, HH:mm");
}

/** Does [start, end] overlap [from, to]? Missing end = point-in-time event. */
export function overlaps(startIso: string, endIso: string | null, from: DateTime, to: DateTime): boolean {
  const s = DateTime.fromISO(startIso, { setZone: true });
  const e = endIso ? DateTime.fromISO(endIso, { setZone: true }) : s;
  return s <= to && e >= from;
}

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
