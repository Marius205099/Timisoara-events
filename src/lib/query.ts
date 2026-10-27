import { z } from "zod";
import { resolveDateRange, type QuickDate } from "./dates";
import { AGE_GROUP_IDS, CATEGORY_IDS, type AgeGroupId, type CategoryId } from "./taxonomy";
import type { EventFilters } from "./types";

/**
 * URL ⇄ filters. Search-friendly, shareable query strings, e.g.
 *   /?zi=sambata&varsta=3-7&familie=1
 * There is deliberately no radius parameter: visitors can only narrow the
 * distance with the 0–10 / 10–25 / 25–50 km bands.
 */
const list = <T extends string>(allowed: readonly T[]) =>
  z
    .union([z.string(), z.array(z.string())])
    .optional()
    .transform((v) => (v === undefined ? [] : (Array.isArray(v) ? v : v.split(",")).filter((x): x is T => (allowed as readonly string[]).includes(x))));

const schema = z.object({
  zi: z.enum(["azi", "maine", "sambata", "duminica", "weekend", "7zile", "data"]).catch("7zile").default("7zile"),
  data: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().catch(undefined),
  varsta: list(AGE_GROUP_IDS),
  familie: z.literal("1").optional().catch(undefined),
  cat: list(CATEGORY_IDS),
  pret: z.enum(["gratuit", "platit"]).optional().catch(undefined),
  tip: z.enum(["interior", "exterior"]).optional().catch(undefined),
  ora: list(["morning", "afternoon", "evening"] as const),
  loc: z.string().max(60).optional().catch(undefined),
  dist: z.enum(["0-10", "10-25", "25-50"]).optional().catch(undefined),
  ff: z.literal("1").optional().catch(undefined),
  acces: z.literal("1").optional().catch(undefined),
  q: z.string().max(80).optional().catch(undefined),
});

export type ParsedQuery = {
  quick: QuickDate;
  date?: string;
  label: string;
  filters: EventFilters;
  raw: z.infer<typeof schema>;
};

export function parseQuery(sp: Record<string, string | string[] | undefined>, now?: Date): ParsedQuery {
  const raw = schema.parse(sp);
  const quick = (raw.zi === "data" && !raw.data ? "7zile" : raw.zi) as QuickDate;
  const range = resolveDateRange(quick, { now, date: raw.data });
  return {
    quick,
    date: raw.data,
    label: range.label,
    raw,
    filters: {
      from: range.from.toISO()!,
      to: range.to.toISO()!,
      ageGroups: raw.varsta as AgeGroupId[],
      familyMode: raw.familie === "1",
      categories: raw.cat as CategoryId[],
      price: raw.pret === "gratuit" ? "free" : raw.pret === "platit" ? "paid" : undefined,
      indoorOutdoor: raw.tip === "interior" ? "indoor" : raw.tip === "exterior" ? "outdoor" : undefined,
      timeOfDay: raw.ora,
      locality: raw.loc || undefined,
      distanceBand: raw.dist,
      familyFriendly: raw.ff === "1",
      accessible: raw.acces === "1",
      q: raw.q || undefined,
    },
  };
}

/** Builds a URL with one parameter changed (used by server-rendered links). */
export function withParam(sp: Record<string, string | string[] | undefined>, key: string, value: string | null, path = "/"): string {
  const u = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) {
    if (v === undefined || k === key) continue;
    for (const x of Array.isArray(v) ? v : [v]) u.append(k, x);
  }
  if (value !== null && value !== "") u.set(key, value);
  const s = u.toString();
  return s ? `${path}?${s}` : path;
}
