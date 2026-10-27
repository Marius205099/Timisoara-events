/**
 * Ingestion audit: per-source counts by status, rejection reasons, distance
 * extremes and a live check of published source links.
 *   npm run audit:sources            (add --no-links to skip HTTP checks)
 */
import { getDb } from "../src/data/db";
import { verifyLink } from "../src/ingestion/http";

async function main() {
  const db = await getDb();
  const bySource = await db.query<Record<string, unknown>>(
    `select es.source_id, e.status, count(distinct e.id)::int n
       from events e join event_sources es on es.event_id = e.id group by 1, 2 order by 1, 2`,
  );
  const reasons = await db.query<Record<string, unknown>>(
    `select coalesce(review_reason, '-') reason, status, count(*)::int n from events where status <> 'published' group by 1, 2 order by n desc`,
  );
  const dist = await db.query<Record<string, unknown>>(
    `select e.status, min(v.distance_km)::text min_km, max(v.distance_km)::text max_km, count(*)::int n
       from events e join venues v on v.id = e.venue_id where v.distance_km is not null group by 1`,
  );
  const rejectedFar = await db.query<Record<string, unknown>>(
    `select e.title, v.name venue, v.locality, v.distance_km::text km from events e join venues v on v.id = e.venue_id
      where e.review_reason = 'out_of_radius' order by v.distance_km desc limit 20`,
  );
  const runs = await db.query<Record<string, unknown>>(`select source_id, status, stats from source_runs order by started_at desc limit 10`);
  const publicMax = await db.query<{ max_km: string | null; n: number }>(`select max((venue->>'distance_km')::numeric)::text max_km, count(*)::int n from public_events`);

  console.log("== Events by source and status");
  console.table(bySource);
  console.log("== Non-published reasons");
  console.table(reasons);
  console.log("== Distance by status (km)");
  console.table(dist);
  console.log("== Rejected because outside 50 km");
  console.table(rejectedFar);
  console.log("== Public feed: max distance", publicMax[0]);
  console.log("== Latest runs");
  for (const r of runs) console.log(r.source_id, r.status, JSON.stringify(r.stats));

  if (!process.argv.includes("--no-links")) {
    const links = await db.query<{ url: string; source_id: string }>(
      `select distinct es.url, es.source_id from event_sources es join events e on e.id = es.event_id
        where e.status = 'published' and es.url like 'http%' limit 40`,
    );
    let ok = 0;
    for (const l of links) {
      const good = await verifyLink(l.url);
      if (good) ok++;
      else console.log("BROKEN", l.source_id, l.url);
      await new Promise((r) => setTimeout(r, 800));
    }
    console.log(`== Source links: ${ok}/${links.length} reachable`);
  }
}

main().then(() => process.exit(0)).catch((e) => {
  console.error(e);
  process.exit(1);
});
