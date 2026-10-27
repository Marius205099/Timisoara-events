/** Categories and age groups. IDs match the seed rows in the database migrations. */

export const CATEGORIES = [
  { id: "concerte", label: "Concerte", emoji: "🎵" },
  { id: "festivaluri", label: "Festivaluri", emoji: "🎪" },
  { id: "teatru", label: "Teatru", emoji: "🎭" },
  { id: "cinema", label: "Cinema", emoji: "🎬" },
  { id: "expozitii", label: "Expoziții", emoji: "🖼️" },
  { id: "muzee", label: "Muzee", emoji: "🏛️" },
  { id: "auto-clasic", label: "Mașini clasice & auto", emoji: "🚗" },
  { id: "sport", label: "Sport", emoji: "⚽" },
  { id: "aer-liber", label: "Activități în aer liber", emoji: "🌳" },
  { id: "ateliere", label: "Ateliere", emoji: "✂️" },
  { id: "gastronomie", label: "Gastronomie", emoji: "🍽️" },
  { id: "cultural", label: "Evenimente culturale", emoji: "📚" },
  { id: "viata-de-noapte", label: "Viață de noapte", emoji: "🌙" },
  { id: "familie", label: "Activități pentru familie", emoji: "👨‍👩‍👧" },
  { id: "seniori", label: "Activități pentru seniori", emoji: "🧓" },
  { id: "comunitate", label: "Comunitate", emoji: "🤝" },
  { id: "targuri", label: "Piețe & târguri", emoji: "🛍️" },
  { id: "tururi", label: "Tururi ghidate", emoji: "🧭" },
  { id: "sezoniere", label: "Atracții sezoniere", emoji: "🎄" },
] as const;

export type CategoryId = (typeof CATEGORIES)[number]["id"];
export const CATEGORY_IDS = CATEGORIES.map((c) => c.id) as CategoryId[];
export const categoryLabel = (id: string) => CATEGORIES.find((c) => c.id === id)?.label ?? id;
export const categoryEmoji = (id: string) => CATEGORIES.find((c) => c.id === id)?.emoji ?? "📅";

/** Broad recommended age groups. `toate` = all ages / family-friendly. */
export const AGE_GROUPS = [
  { id: "0-2", label: "0–2 ani", min: 0, max: 2 },
  { id: "3-7", label: "3–7 ani", min: 3, max: 7 },
  { id: "8-12", label: "8–12 ani", min: 8, max: 12 },
  { id: "13-17", label: "13–17 ani", min: 13, max: 17 },
  { id: "18-64", label: "18–64 ani", min: 18, max: 64 },
  { id: "65+", label: "65+ ani", min: 65, max: 120 },
] as const;

export type AgeGroupId = (typeof AGE_GROUPS)[number]["id"];
export const AGE_GROUP_IDS = AGE_GROUPS.map((a) => a.id) as AgeGroupId[];
export const ageGroupLabel = (id: string) => AGE_GROUPS.find((a) => a.id === id)?.label ?? id;
