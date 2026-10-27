import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod/v4";
import { AGE_GROUP_IDS, CATEGORY_IDS, type AgeGroupId, type CategoryId } from "@/lib/taxonomy";
import type { IndoorOutdoor } from "@/lib/types";
import { normalizeText } from "@/lib/filters";
import { officiallyAllowsGroup } from "@/lib/age";
import type { RawEvent } from "./types";
import { truncate } from "./text";

/**
 * Enrichment = classification + a short original Romanian summary. It never
 * touches location, dates, prices or official age restrictions — those come
 * from deterministic parsing only. AI output is stored with its confidence and
 * the evidence it cited.
 */

export interface Enrichment {
  categories: CategoryId[];
  recommendedAgeGroups: AgeGroupId[];
  allAges: boolean;
  familyFriendly: boolean;
  indoorOutdoor: IndoorOutdoor;
  summary: string;
  confidence: number;
  uncertainties: string[];
  evidence: string[];
  method: "ai" | "rules";
}

// ---------------------------------------------------------------------------
// Deterministic rules (always available; also used when AI is off or fails).
// ---------------------------------------------------------------------------
const KEYWORDS: [CategoryId, RegExp][] = [
  ["concerte", /\b(concert|recital|simfonic|filarmonic|orchestr|jazz|rock|dj set|live music|cvartet|cor\b|muzica)/],
  ["festivaluri", /\bfestival/],
  ["teatru", /\b(teatru|spectacol|piesa|comedie|drama|musical|opera|opereta|balet|stand-?up|improv)/],
  ["cinema", /\b(film|cinema|proiectie|movie)/],
  ["expozitii", /\b(expozitie|vernisaj|galerie|exhibition|arta contemporana)/],
  ["muzee", /\bmuzeu/],
  ["auto-clasic", /\b(masini clasice|oldtimer|retro ?mobil|auto show|automobil|classic car|motociclet)/],
  ["sport", /\b(meci|maraton|alergare|fotbal|baschet|handbal|volei|ciclism|turneu|sport|cros)/],
  ["aer-liber", /\b(aer liber|drumetie|parc|picnic|outdoor|plimbare|natura)/],
  ["ateliere", /\b(atelier|workshop|curs|masterclass)/],
  ["gastronomie", /\b(gastronom|food|degustare|vin|street food|culinar|bere)/],
  ["cultural", /\b(lansare de carte|carte|lectura|conferinta|prelegere|dezbatere|poezie|literar)/],
  ["viata-de-noapte", /\b(party|petrecere|club|clubbing|dj\b|night)/],
  ["familie", /\b(copii|familie|family|kids|papusi|basm|povest)/],
  ["seniori", /\b(seniori|varstnici|pensionari)/],
  ["comunitate", /\b(voluntariat|comunitate|caritabil|meetup|intalnire)/],
  ["targuri", /\b(targ|piata|bazar|market|fair)/],
  ["tururi", /\b(tur ghidat|tur pietonal|guided tour|tur\b)/],
  ["sezoniere", /\b(craciun|advent|paste|halloween|patinoar|carnaval)/],
];

export function rulesEnrich(e: RawEvent, officialMinAge: number | null): Enrichment {
  const text = normalizeText(`${e.title} ${e.description ?? ""} ${(e.categoryHints ?? []).join(" ")}`);
  const categories = KEYWORDS.filter(([, re]) => re.test(text)).map(([c]) => c);
  const kids = /\b(copii|kids|familie|family|papusi|basm|povest|pinocchio|scufita|jungle|junglei)/.test(text);
  const toddlers = /\b(bebe|bebelusi|0-3|0-2 ani|prescolari)/.test(text);
  const nightlife = categories.includes("viata-de-noapte");

  let groups: AgeGroupId[];
  if (officialMinAge != null && officialMinAge >= 18) groups = ["18-64", "65+"];
  else if (toddlers) groups = ["0-2", "3-7"];
  else if (kids) groups = ["3-7", "8-12"];
  else if (nightlife) groups = ["18-64"];
  else if (officialMinAge != null && officialMinAge >= 12) groups = ["13-17", "18-64", "65+"];
  else groups = ["18-64", "65+"];
  groups = groups.filter((g) => officiallyAllowsGroup({ officialMinAge, officialMaxAge: null }, g));

  const outdoor = /\b(aer liber|parc|outdoor|piata unirii|piata victoriei|strand|lac)\b/.test(text);
  return {
    categories: categories.length ? [...new Set(categories)].slice(0, 3) : ["cultural"],
    recommendedAgeGroups: groups,
    allAges: false,
    familyFriendly: kids && (officialMinAge ?? 0) < 12,
    indoorOutdoor: outdoor ? "outdoor" : e.venue.name ? "indoor" : "unknown",
    summary: buildSummary(e),
    confidence: 0.5,
    uncertainties: ["Clasificare automată pe bază de reguli; vârstele recomandate sunt orientative."],
    evidence: categories.map((c) => `keyword:${c}`),
    method: "rules",
  };
}

function buildSummary(e: RawEvent): string {
  const desc = (e.description ?? "").replace(/\s+/g, " ").trim();
  // Only the first sentence(s) of the source text, clearly short — the detail page links the original.
  const first = desc.split(/(?<=[.!?])\s+/).slice(0, 2).join(" ");
  return truncate(first || e.title, 220);
}

// ---------------------------------------------------------------------------
// AI enrichment (Claude, server-side only).
// ---------------------------------------------------------------------------
const EnrichmentSchema = z.object({
  categories: z.array(z.enum(CATEGORY_IDS as [CategoryId, ...CategoryId[]])),
  recommended_age_groups: z.array(z.enum(AGE_GROUP_IDS as [AgeGroupId, ...AgeGroupId[]])),
  all_ages: z.boolean(),
  family_friendly: z.boolean(),
  indoor_outdoor: z.enum(["indoor", "outdoor", "mixed", "unknown"]),
  summary_ro: z.string(),
  confidence: z.number(),
  uncertainties: z.array(z.string()),
  evidence: z.array(z.string()),
});

const SYSTEM_PROMPT = `Classify local events in and around Timișoara, Romania, for a public family-friendly event guide.
Use only the facts in the event record you are given. Do not invent dates, prices, venues, booking availability, or age restrictions.
- categories: 1–3 best-fitting category ids.
- recommended_age_groups: the age groups the event is realistically interesting and suitable for. This is a recommendation, not a legal restriction. If an official minimum age is provided, never recommend groups below it.
- all_ages: true only if the event is genuinely suitable and interesting for every age, babies to seniors (e.g. open-air festivals, fairs, exhibitions in public squares).
- family_friendly: true if parents can reasonably bring children.
- summary_ro: an original 1–2 sentence summary in Romanian (max 220 characters), written in your own words, not copied from the description.
- evidence: short quotes or facts from the record that justify the classification.
- uncertainties: anything unclear or contradictory (e.g. possible cancellation, unclear audience).
- confidence: 0–1 for the overall classification.`;

let client: Anthropic | null = null;
export const isAiEnabled = () => Boolean(process.env.ANTHROPIC_API_KEY) && process.env.AI_ENRICHMENT !== "off";

export async function aiEnrich(e: RawEvent, officialMinAge: number | null): Promise<Enrichment> {
  client ??= new Anthropic(); // reads ANTHROPIC_API_KEY from the server environment only
  const record = {
    title: e.title,
    description: truncate(e.description ?? "", 2500),
    venue: e.venue.name,
    locality: e.venue.locality,
    official_min_age: officialMinAge,
    source_categories: e.categoryHints ?? [],
    first_date: e.sessions[0]?.startsAt,
  };
  const response = await client.beta.messages.parse({
    model: process.env.AI_MODEL ?? "claude-sonnet-5-5",
    max_tokens: 2048,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    system: SYSTEM_PROMPT,
    output_config: { effort: "low", format: betaZodOutputFormat(EnrichmentSchema) },
    messages: [{ role: "user", content: `Event record (JSON):\n${JSON.stringify(record)}` }],
  });
  if (response.stop_reason === "refusal" || !response.parsed_output) {
    throw new Error(`AI enrichment unavailable (stop_reason=${response.stop_reason})`);
  }
  const o = response.parsed_output;
  // Enforce "never recommend below the official minimum age" deterministically as well.
  const groups = o.recommended_age_groups.filter((g) => officiallyAllowsGroup({ officialMinAge, officialMaxAge: null }, g));
  return {
    categories: o.categories.length ? [...new Set(o.categories)].slice(0, 3) : ["cultural"],
    recommendedAgeGroups: [...new Set(groups)],
    allAges: o.all_ages && (officialMinAge ?? 0) === 0,
    familyFriendly: o.family_friendly && (officialMinAge ?? 0) < 12,
    indoorOutdoor: o.indoor_outdoor,
    summary: truncate(o.summary_ro.trim(), 240),
    confidence: Math.max(0, Math.min(1, o.confidence)),
    uncertainties: o.uncertainties,
    evidence: o.evidence,
    method: "ai",
  };
}

export async function enrich(e: RawEvent, officialMinAge: number | null): Promise<Enrichment> {
  if (!isAiEnabled()) return rulesEnrich(e, officialMinAge);
  try {
    return await aiEnrich(e, officialMinAge);
  } catch {
    return rulesEnrich(e, officialMinAge);
  }
}
