import { NextResponse } from "next/server";
import { getDb } from "@/data/db";
import { listPublicEvents } from "@/data/public";
import { GEOFENCE_MAX_METERS, TIMISOARA_CENTER } from "@/lib/config";
import { applyFilters } from "@/lib/filters";
import { parseQuery } from "@/lib/query";

export const dynamic = "force-dynamic";

/**
 * Public read-only JSON API. Same parameters as the website URL (zi, data, varsta,
 * familie, cat, pret, tip, ora, loc, dist, q). Any radius-like parameter is
 * ignored: results are always limited to verified venues within 50 km.
 */
export async function GET(req: Request) {
  const sp = Object.fromEntries(new URL(req.url).searchParams.entries());
  const q = parseQuery(sp);
  const events = applyFilters(await listPublicEvents(await getDb(), q.filters.from, q.filters.to), q.filters);
  return NextResponse.json(
    {
      center: TIMISOARA_CENTER,
      maxDistanceKm: GEOFENCE_MAX_METERS / 1000,
      from: q.filters.from,
      to: q.filters.to,
      count: events.length,
      events: events.map(({ description: _d, ...e }) => e),
    },
    { headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600", "Access-Control-Allow-Origin": "*" } },
  );
}
