import { AGE_GROUPS, type AgeGroupId } from "./taxonomy";

/**
 * Age filtering keeps four things apart:
 *  A. official min/max age (organizer/legal) — hard constraint, never inferred
 *  B. recommended age groups (AI/rules) — soft relevance
 *  C. allAges / familyFriendly flags
 *  D. accessibility (handled elsewhere)
 */
export interface AgeInfo {
  officialMinAge: number | null;
  officialMaxAge: number | null;
  recommendedAgeGroups: AgeGroupId[];
  allAges: boolean;
  familyFriendly: boolean;
}

const group = (id: AgeGroupId) => AGE_GROUPS.find((g) => g.id === id)!;

/** Can at least some people of this age group attend, given the official restriction? */
export function officiallyAllowsGroup(e: Pick<AgeInfo, "officialMinAge" | "officialMaxAge">, id: AgeGroupId): boolean {
  const g = group(id);
  const min = e.officialMinAge ?? 0;
  const max = e.officialMaxAge ?? 200;
  return g.max >= min && g.min <= max;
}

export function matchesAgeFilter(e: AgeInfo, selected: AgeGroupId[] | undefined, familyMode = false): boolean {
  if (!selected || selected.length === 0) {
    // ALL AGES mode: no interest filter. Family mode alone keeps only family-suitable events.
    return familyMode ? (e.allAges || e.familyFriendly) && !hasAdultOnlyRestriction(e) : true;
  }

  if (familyMode) {
    // Everyone in the group must be allowed in, and the event must suit all of them.
    if (!selected.every((id) => officiallyAllowsGroup(e, id))) return false;
    if (e.allAges || e.familyFriendly) return true;
    return selected.every((id) => e.recommendedAgeGroups.includes(id));
  }

  // At least one selected group must be officially allowed and be a relevant audience.
  return selected.some(
    (id) => officiallyAllowsGroup(e, id) && (e.allAges || e.recommendedAgeGroups.includes(id)),
  );
}

/** Sort weight for family mode: events suitable for every selected group come first. */
export function familyScore(e: AgeInfo, selected: AgeGroupId[]): number {
  if (e.allAges) return 3;
  if (selected.length && selected.every((id) => e.recommendedAgeGroups.includes(id))) return 2;
  if (e.familyFriendly) return 1;
  return 0;
}

export function hasAdultOnlyRestriction(e: Pick<AgeInfo, "officialMinAge">): boolean {
  return (e.officialMinAge ?? 0) >= 18;
}

export function officialAgeLabel(e: Pick<AgeInfo, "officialMinAge" | "officialMaxAge">): string | null {
  const { officialMinAge: min, officialMaxAge: max } = e;
  if (min != null && max != null) return `${min}–${max} ani (restricție oficială)`;
  if (min != null && min > 0) return `${min}+ (restricție oficială)`;
  if (max != null) return `până la ${max} ani (restricție oficială)`;
  return null;
}

/** Parses official restriction labels such as "16+", "+16 ani", "18+ only", "6-12 ani". */
export function parseOfficialAge(text: string | null | undefined): { min: number | null; max: number | null } {
  if (!text) return { min: null, max: null };
  const t = text.toLowerCase();
  const range = t.match(/\b(\d{1,2})\s*[-–]\s*(\d{1,2})\s*(?:ani|years|jahre)\b/);
  if (range) return { min: Number(range[1]), max: Number(range[2]) };
  const plus = t.match(/(?:^|[\s(])\+\s?(\d{1,2})\b|\b(\d{1,2})\s?\+/);
  if (plus) return { min: Number(plus[1] ?? plus[2]), max: null };
  const peste = t.match(/(?:peste|minim(?:um)?|de la)\s+(\d{1,2})\s+ani/);
  if (peste) return { min: Number(peste[1]), max: null };
  return { min: null, max: null };
}
