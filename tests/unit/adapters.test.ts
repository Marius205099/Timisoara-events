import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parseIcs } from "@/ingestion/adapters/ical";
import { parseTribeEvents } from "@/ingestion/adapters/tribe";
import { parseJsonLdEvents } from "@/ingestion/adapters/jsonld";
import { parseTeatrulGermanProgram } from "@/ingestion/adapters/teatrul-german";
import { isAllowedByRobots, parseRobots } from "@/ingestion/http";
import { isLikelyDuplicate, titleSimilarity } from "@/lib/dedupe";
import { matchKnownVenue } from "@/ingestion/known-venues";
import { normalizeStreet } from "@/ingestion/geocode";

// Real snapshots captured on 2026-10-27 from the public sources.
const fx = (n: string) => fs.readFileSync(path.join(__dirname, "..", "fixtures", n), "utf8");

describe("adapters on real source snapshots", () => {
  it("TNTM iCal: titles, local times, GEO, official age, ticket link", () => {
    const evs = parseIcs(fx("tntm.ics"), "tntm", { now: new Date("2026-10-27T00:00:00Z") });
    expect(evs.length).toBe(19);
    const u = evs.find((e) => e.title === "UNDERGROUND FM")!;
    expect(u.sessions[0].startsAt).toBe("2026-10-29T19:00:00.000+02:00");
    expect(u.venue.lat).toBeCloseTo(45.755069, 5);
    expect(u.officialAgeText).toBe("+16 ani");
    expect(u.ticketUrl).toMatch(/^https:\/\/www\.eventim\.ro\//);
    expect(u.url).toMatch(/^https:\/\/www\.tntm\.ro\//);
  });

  it("Filarmonica Banatul (The Events Calendar API): timezone-aware dates and venue", () => {
    const evs = parseTribeEvents(JSON.parse(fx("filarmonica-tribe.json")), "filarmonica-banatul");
    expect(evs.length).toBe(10);
    expect(evs[1].sessions[0]).toMatchObject({ startsAt: "2026-10-28T19:00:00.000+02:00", endsAt: "2026-10-28T20:30:00.000+02:00" });
    expect(evs[1].venue.name).toBe("Mansarda Bastionului Maria Theresia");
    expect(evs.every((e) => e.url.startsWith("https://filarmonicabanatul.ro/"))).toBe(true);
  });

  it("iabilet JSON-LD: Event with Place and offers", () => {
    const [e] = parseJsonLdEvents(fx("iabilet-event.html"), "https://www.iabilet.ro/x/", "iabilet");
    expect(e.title).toContain("Grand Demo Day");
    expect(e.sessions[0].startsAt).toBe("2026-10-29T17:30:00.000+02:00");
    expect(e.venue.locality).toBe("Timișoara");
    expect(e.attendanceMode).toBe("offline");
    expect(e.isFree).toBe(false);
  });

  it("JSON-LD: EventRescheduled with a new date is scheduled (with a notice), city prefix stripped", () => {
    const html = `<script type="application/ld+json">${JSON.stringify({
      "@context": "https://schema.org", "@type": "Event", name: "Timisoara: Aladdin",
      eventStatus: "https://schema.org/EventRescheduled", startDate: "2026-11-04T18:30:00+02:00", previousStartDate: "2026-09-28T18:30:00+03:00",
      location: { "@type": "Place", name: "Opera", address: { "@type": "PostalAddress", streetAddress: "Str. Mărășești 2", addressLocality: "Timișoara" } },
    })}</script>`;
    const [e] = parseJsonLdEvents(html, "https://x.test/e", "iabilet");
    expect(e.title).toBe("Aladdin");
    expect(e.status).toBe("scheduled");
    expect(e.notice).toContain("28.09.2026");
  });

  it("Teatrul German: home shows at the theatre, touring date located in Oradea", () => {
    const evs = parseTeatrulGermanProgram(fx("teatrul-german-program.html"), "https://teatrulgerman.ro/ro/program/", "teatrul-german");
    expect(evs.length).toBeGreaterThan(5);
    const tour = evs.find((e) => e.title.startsWith("Penthesilea") && e.venue.name !== "Teatrul German de Stat Timișoara")!;
    expect(tour.venue.locality).toBe("Oradea");
    expect(tour.organizer?.address).toContain("Timișoara"); // organizer is in Timișoara — must not matter
    expect(evs.filter((e) => e.venue.locality === "Timișoara").every((e) => e.officialAgeText?.endsWith("+"))).toBe(true);
  });
});

describe("robots.txt", () => {
  const rules = parseRobots(`User-agent: *\nDisallow: /wp-admin/\nAllow: /wp-admin/admin-ajax.php\nDisallow: /*/feed/$\n\nUser-agent: ClaudeBot\nCrawl-delay: 10`);
  it("applies longest-match semantics", () => {
    expect(isAllowedByRobots(rules, "/wp-admin/x")).toBe(false);
    expect(isAllowedByRobots(rules, "/wp-admin/admin-ajax.php")).toBe(true);
    expect(isAllowedByRobots(rules, "/blog/feed/")).toBe(false);
    expect(isAllowedByRobots(rules, "/blog/feed/x")).toBe(true);
    expect(isAllowedByRobots(rules, "/evenimente/")).toBe(true);
  });
  it("honours a group addressed to our bot", () => {
    const r = parseRobots(`User-agent: *\nAllow: /\n\nUser-agent: CeFacemTimisoaraBot\nDisallow: /`);
    expect(isAllowedByRobots(r, "/anything")).toBe(false);
  });
});

describe("dedupe & venue matching", () => {
  it("same show from two sources is a duplicate; different shows are not", () => {
    const venue = { lat: 45.7543, lng: 21.2260 };
    expect(isLikelyDuplicate(
      { title: "Anna Karenina", startsAt: "2026-11-05T19:00:00+02:00", venue },
      { title: "Bilete Anna Karenina - Teatrul Național Timișoara", startsAt: "2026-11-05T19:00:00+02:00", venue: { lat: 45.7545, lng: 21.2262 } },
    ).duplicate).toBe(true);
    expect(isLikelyDuplicate(
      { title: "Anna Karenina", startsAt: "2026-11-05T19:00:00+02:00", venue },
      { title: "Edmond", startsAt: "2026-11-05T19:00:00+02:00", venue },
    ).duplicate).toBe(false);
    expect(isLikelyDuplicate(
      { title: "Anna Karenina", startsAt: "2026-11-05T19:00:00+02:00", venue },
      { title: "Anna Karenina", startsAt: "2026-11-06T19:00:00+02:00", venue },
    ).duplicate).toBe(false);
    expect(titleSimilarity("Concert Simfonic", "concert simfonic!")).toBe(1);
  });

  it("known venues match by name aliases", () => {
    expect(matchKnownVenue("Sala Capitol Timișoara")?.key).toBe("sala-capitol");
    expect(matchKnownVenue('Studio "UTU Strugari"')?.key).toBe("teatrul-national");
    expect(matchKnownVenue("Mansarda Bastionului Maria Theresia")?.key).toBe("bastion");
    expect(matchKnownVenue("Sala Polivalentă")).toBeNull();
  });

  it("normalizes street addresses for structured geocoding", () => {
    expect(normalizeStreet("Strada Hector, Nr.1")).toBe("1 Strada Hector");
    expect(normalizeStreet("Str. Gheorghe Lazăr nr. 4, Interfon 05, et. 2, ap. 32")).toBe("4 Strada Gheorghe Lazăr");
    expect(normalizeStreet("Bv. Iuliu Maniu nr 23A, Timișoara")).toBe("23A Bulevardul Iuliu Maniu");
    expect(normalizeStreet(" Strada Socrate 12, a, 300551, Timișoara")).toBe("12 Strada Socrate");
  });
});
