import { DateTime } from "luxon";
import { TIMEZONE } from "@/lib/config";

/**
 * Ingestion targets 06:00 and 18:00 Europe/Bucharest. External schedulers run in
 * UTC, so the cron fires at every UTC hour that can map to those local times
 * (03,04,15,16 UTC covers both EET and EEST) and this function decides whether
 * the current moment belongs to a slot. Each slot gets one idempotency key, so a
 * second trigger inside the same window does nothing.
 */
export const SLOT_HOURS = [6, 18] as const;
const WINDOW_HOURS = 2; // tolerate delayed cron starts

export function slotFor(now: Date = new Date()): string | null {
  const local = DateTime.fromJSDate(now).setZone(TIMEZONE);
  for (const h of SLOT_HOURS) {
    if (local.hour >= h && local.hour < h + WINDOW_HOURS) return `${local.toFormat("yyyy-LL-dd")}T${String(h).padStart(2, "0")}`;
  }
  return null;
}

export function manualSlot(): string {
  return `manual-${DateTime.now().setZone(TIMEZONE).toFormat("yyyy-LL-dd'T'HH:mm:ss")}-${Math.random().toString(36).slice(2, 6)}`;
}
