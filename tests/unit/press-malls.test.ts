import fs from "node:fs";
import path from "node:path";
import { DateTime } from "luxon";
import { describe, expect, it } from "vitest";
import { findDateMentions, findTime, toSession } from "@/ingestion/ro-dates";
import { iuliusSessions, parseIuliusList, parseShoppingCityList, shoppingCitySession } from "@/ingestion/adapters/malls";
import { extractPressEvent, findNamedPlaces, parseRss } from "@/ingestion/adapters/press";
import { htmlToText } from "@/ingestion/text";
import { isLikelyDuplicate } from "@/lib/dedupe";

// Real snapshots captured on 2026-10-28 from the public sources.
const fx = (n: string) => fs.readFileSync(path.join(__dirname, "..", "fixtures", n), "utf8");
const NOW = DateTime.fromISO("2026-10-28T09:00:00", { zone: "Europe/Bucharest" });

describe("Romanian free-text dates", () => {
  it("reads single days, ranges across months and the closest year", () => {
    const [one] = findDateMentions("Pe 31 octombrie, la Iulius", NOW);
    expect(one.start.toISODate()).toBe("2026-10-31");
    const [r] = findDateMentions("9 octombrie - 1 noiembrie", NOW);
    expect([r.start.toISODate(), r.end?.toISODate()]).toEqual(["2026-10-09", "2026-11-01"]);
    const [same] = findDateMentions("26 - 30 octombrie", NOW);
    expect([same.start.toISODate(), same.end?.toISODate()]).toEqual(["2026-10-26", "2026-10-30"]);
    // Read in late October, "22 august" is the past August, "5 ianuarie" the coming January.
    expect(findDateMentions("22 august", NOW)[0].start.toISODate()).toBe("2026-08-22");
    expect(findDateMentions("5 ianuarie", NOW)[0].start.toISODate()).toBe("2027-01-05");
  });

  it("reads times and builds sessions (night events end the next day)", () => {
    expect(findTime("de la ora 19:30")).toEqual({ start: { hour: 19, minute: 30 }, end: null });
    expect(findTime("între orele 10.00-13.00")).toEqual({ start: { hour: 10, minute: 0 }, end: { hour: 13, minute: 0 } });
    const [d] = findDateMentions("31 octombrie", NOW);
    expect(toSession(d, findTime("20:00 – 04:00"))).toEqual({ startsAt: "2026-10-31T20:00:00.000+02:00", endsAt: "2026-11-01T04:00:00.000+02:00", allDay: false });
  });
});

describe("Iulius Town", () => {
  const items = parseIuliusList(fx("iulius-evenimente.html"), "https://iuliustown.ro/ro/evenimente");

  it("lists events with their date text", () => {
    expect(items.length).toBeGreaterThan(30);
    expect(items.find((i) => i.title === "Halloween Kids Party 2026")?.dateText).toBe("31 octombrie");
  });

  it("resolves a weekly series from the dated programme on its page", () => {
    const item = items.find((i) => i.title === "Teatru interactiv pentru copii")!;
    const text = htmlToText(fx("iulius-teatru.html"));
    const s = iuliusSessions(item, text, NOW);
    expect(s.slice(0, 3).map((x) => x.startsAt)).toEqual([
      "2026-11-01T12:00:00.000+02:00", "2026-11-08T12:00:00.000+02:00", "2026-11-15T12:00:00.000+02:00",
    ]);
  });

  it("skips open-ended items and makes a range one all-day session", () => {
    expect(iuliusSessions({ url: "x", title: "Marțea Moca", dateText: "din 12 mai 2026" }, "", NOW)).toEqual([]);
    expect(iuliusSessions({ url: "x", title: "LEGO", dateText: "6 - 8 noiembrie" }, "", NOW)[0]).toMatchObject({ startsAt: "2026-11-06T00:00:00.000+02:00", allDay: true });
  });
});

describe("Shopping City Timișoara", () => {
  it("reads page data and drops months-long store campaigns", () => {
    const evs = parseShoppingCityList(fx("shoppingcity-evenimente.html"));
    const halloween = evs.find((e) => /HALLOWEEN/.test(e.name))!;
    expect(shoppingCitySession(halloween)).toEqual({ startsAt: "2026-10-31T16:00:00.000+02:00", endsAt: "2026-10-31T21:00:00.000+02:00", allDay: false });
    const campaign = evs.find((e) => /accesul câinilor/.test(e.name))!;
    expect(shoppingCitySession(campaign)).toBeNull();
  });
});

describe("local press", () => {
  const items = parseRss(fx("pressalert-cultura.xml"));
  const extract = (re: RegExp) => {
    const it = items.find((i) => re.test(i.title))!;
    return extractPressEvent({ url: it.url, title: it.title, text: htmlToText(it.html), publishedAt: it.publishedAt }, "pressalert", NOW, { defaultLocality: "Timișoara" });
  };

  it("turns a single-date, single-venue announcement into an event", () => {
    const e = extract(/Ives, Elgar/)!;
    expect(e.venue.name).toBe("Sala Capitol (Filarmonica Banatul)");
    expect(e.sessions[0]).toMatchObject({ startsAt: "2026-10-30T19:00:00.000+02:00", allDay: false });
  });

  it("skips an article spread over several places", () => {
    expect(extract(/galerie de sculptură/)).toBeNull();
  });

  it("skips daily agendas and articles without a place", () => {
    const base = { url: "u", publishedAt: NOW };
    expect(extractPressEvent({ ...base, title: "Ce facem astăzi, 28 octombrie, în Timișoara?", text: "Concert la Sala Capitol de la ora 19:00." }, "tion", NOW)).toBeNull();
    expect(extractPressEvent({ ...base, title: "Concert caritabil", text: "Pe 5 noiembrie, de la ora 18:00, are loc un concert caritabil." }, "tion", NOW, { defaultLocality: "Timișoara" })).toBeNull();
  });

  it("keeps the town apart from the venue name, so Lugoj venues are not placed in Timișoara", () => {
    expect(findNamedPlaces("la Casa de Cultură din Lugoj, de la ora 18").map((p) => p.name)).toEqual(["Casa de Cultură"]);
    const e = extractPressEvent(
      { url: "u", publishedAt: NOW, title: "Concert la Lugoj", text: "Sâmbătă, 7 noiembrie, de la ora 18:00, concert la Casa de Cultură din Lugoj." },
      "renasterea", NOW,
    )!;
    expect(e.venue).toMatchObject({ name: "Casa de Cultură", locality: "Lugoj" });
  });

  it("merges with the venue's own event at the same place and time, whatever the headline", () => {
    const venue = { lat: 45.7505647, lng: 21.2262177 };
    const own = { title: "PERSPECTIVE | Orchestra simfonică", startsAt: "2026-10-30T19:00:00+02:00", venue };
    const press = { title: "Muzică de Ives, Elgar și Haydn pe scena Sălii Capitol", startsAt: "2026-10-30T19:00:00+02:00", venue };
    expect(isLikelyDuplicate(press, own).duplicate).toBe(false);
    expect(isLikelyDuplicate(press, own, { sameSlotIsEnough: true }).duplicate).toBe(true);
    // A different building 150 m away at the same hour is a different event.
    const nextDoor = { ...press, venue: { lat: 45.7519, lng: 21.2262 } };
    expect(isLikelyDuplicate(nextDoor, own, { sameSlotIsEnough: true }).duplicate).toBe(false);
  });
});
