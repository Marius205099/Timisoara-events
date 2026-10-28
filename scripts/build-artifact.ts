/**
 * Builds the claude.ai Artifact version (same approach as Nestor.ai: one HTML
 * page assembled from artifact/src/). Embeds a snapshot of PUBLISHED events whose
 * verified venue is within 50 km, re-checked here with the geodesic rule.
 *   npx tsx scripts/build-artifact.ts   →   artifact/ce-facem-timisoara.html
 */
import fs from "node:fs";
import path from "node:path";
import { DateTime } from "luxon";
import { getDb } from "../src/data/db";
import { listPublicEvents } from "../src/data/public";
import { TIMEZONE, TIMISOARA_CENTER } from "../src/lib/config";
import { checkGeofence } from "../src/lib/geo";
import { PLACES, PLACE_CATEGORIES } from "../src/data/places";
import { SOURCES } from "../src/ingestion/sources";

const DIR = path.join(process.cwd(), "artifact");

async function main() {
  const db = await getDb();
  const now = DateTime.now().setZone(TIMEZONE);
  const events = await listPublicEvents(db, now.startOf("day").toISO()!, now.plus({ days: 60 }).endOf("day").toISO()!);
  const out = [];
  for (const e of events) {
    const g = checkGeofence({ lat: e.venue.lat ?? undefined, lng: e.venue.lng ?? undefined });
    if (!g.ok || e.isDemo) continue; // only real, verified, inside 50 km
    const sessions = e.sessions
      .filter((s) => DateTime.fromISO(s.endsAt ?? s.startsAt) >= now.minus({ hours: 2 }))
      .map((s) => {
        const st = DateTime.fromISO(s.startsAt).setZone(TIMEZONE);
        const en = s.endsAt ? DateTime.fromISO(s.endsAt).setZone(TIMEZONE) : null;
        return { d: st.toISODate(), t: s.allDay ? null : st.toFormat("HH:mm"), e: en && !s.allDay ? en.toFormat("HH:mm") : null, h: st.hour, x: s.status === "canceled" ? 1 : 0 };
      });
    if (e.kind === "scheduled" && !sessions.length) continue;
    out.push({
      id: e.slug, k: e.kind === "evergreen" ? 1 : 0, c: e.status === "canceled" ? 1 : 0, title: e.title,
      sum: e.summary, cat: e.categories, ag: e.recommendedAgeGroups, all: e.allAges ? 1 : 0, fam: e.familyFriendly ? 1 : 0,
      min: e.officialMinAge, max: e.officialMaxAge, free: e.isFree, pmin: e.priceMin, pmax: e.priceMax, cur: e.currency,
      io: e.indoorOutdoor, org: e.organizer, tix: e.ticketUrl, acc: e.accessibility, note: e.uncertaintyNote,
      v: { n: e.venue.name, a: e.venue.address, l: e.venue.locality, lat: e.venue.lat, lng: e.venue.lng, km: Math.round(g.distanceKm * 10) / 10 },
      s: sessions, src: e.sources.filter((x) => x.url.startsWith("http")).map((x) => ({ n: x.sourceName, u: x.url })),
      ver: DateTime.fromISO(e.lastVerifiedAt).setZone(TIMEZONE).toFormat("dd.LL.yyyy HH:mm"),
    });
  }
  // Places to visit any day: the same 50 km rule applies; a place outside it fails the build.
  const places = PLACES.map((p) => {
    const g = checkGeofence({ lat: p.lat, lng: p.lng });
    if (!g.ok) throw new Error(`place ${p.id} is outside the 50 km radius`);
    return {
      id: p.id, n: p.name, cat: p.cat, d: p.desc, a: p.address, l: p.locality, lat: p.lat, lng: p.lng,
      km: Math.round(g.distanceKm * 10) / 10, ax: p.approx ? 1 : 0, u: p.url ?? null, ag: p.ages, io: p.io, free: p.free ? 1 : 0,
    };
  });
  const data = { built: now.toFormat("dd.LL.yyyy, HH:mm"), center: TIMISOARA_CENTER, events: out, places, pcats: PLACE_CATEGORIES };
  const src = (f: string) => fs.readFileSync(path.join(DIR, "src", f), "utf8");
  const html = src("page.html")
    .replace("/*__STYLES__*/", src("styles.css"))
    .replace("<!--__SOURCES__-->", SOURCES.filter((x) => x.enabled && x.adapter !== "manual").map((x) => x.name).join(", "))
    .replace("/*__DATA__*/", `window.CF_DATA = ${JSON.stringify(data).replace(/</g, "\\u003c")};`)
    .replace("/*__APP__*/", src("app.js"));
  fs.writeFileSync(path.join(DIR, "ce-facem-timisoara.html"), html);
  // Same page as a standalone public website (GitHub Pages / any static host): claude.ai adds the
  // document skeleton when publishing an Artifact, a static host does not.
  fs.mkdirSync(path.join(DIR, "public"), { recursive: true });
  fs.writeFileSync(path.join(DIR, "public", "index.html"), `<!doctype html>\n<html lang="ro">\n${html}\n</html>\n`);
  fs.writeFileSync(path.join(DIR, "public", ".nojekyll"), "");
  console.log(`built artifact/ce-facem-timisoara.html: ${out.length} events, ${places.length} places, ${(html.length / 1024).toFixed(0)} KB`);
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
