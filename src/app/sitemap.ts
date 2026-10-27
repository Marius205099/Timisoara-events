import type { MetadataRoute } from "next";
import { getDb } from "@/data/db";
import { listPublicSlugs } from "@/data/public";
import { SITE_URL } from "@/lib/config";

export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const slugs = await listPublicSlugs(await getDb());
  const quick = ["azi", "maine", "sambata", "duminica", "weekend"].map((z) => ({ url: `${SITE_URL}/?zi=${z}`, changeFrequency: "daily" as const, priority: 0.8 }));
  return [
    { url: SITE_URL, changeFrequency: "hourly", priority: 1 },
    ...quick,
    { url: `${SITE_URL}/adauga-eveniment`, priority: 0.3 },
    { url: `${SITE_URL}/despre`, priority: 0.3 },
    ...slugs.map((s) => ({ url: `${SITE_URL}/eveniment/${s.slug}`, lastModified: s.updatedAt, changeFrequency: "daily" as const, priority: 0.6 })),
  ];
}
