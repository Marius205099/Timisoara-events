import { DateTime } from "luxon";
import { TIMEZONE } from "@/lib/config";
import { slugify } from "@/lib/dedupe";
import type { AgeGroupId, CategoryId } from "@/lib/taxonomy";
import type { Db } from "./db";

/**
 * DEMO data — only seeded into the embedded database when no real database is
 * configured. Every row is flagged is_demo and the UI shows a "DEMO" badge.
 * Dates are generated relative to today so every quick filter has content.
 * Real events come from `npm run ingest` (see README).
 */

interface DemoEvent {
  title: string;
  summary: string;
  kind?: "scheduled" | "evergreen";
  status?: "published" | "needs_review" | "rejected" | "canceled";
  venue: { name: string; address: string; locality: string; lat: number | null; lng: number | null };
  day?: number; // 6 = coming Saturday, 7 = coming Sunday, 0 = today, 1 = tomorrow…
  time?: string;
  durationH?: number;
  categories: CategoryId[];
  ages: AgeGroupId[];
  allAges?: boolean;
  family?: boolean;
  minAge?: number;
  free?: boolean;
  price?: number;
  io: "indoor" | "outdoor" | "mixed";
  accessibility?: string;
  reviewReason?: string;
  uncertainty?: string;
}

const DEMO: DemoEvent[] = [
  { title: "Târg de toamnă în Piața Victoriei", summary: "Producători locali, ateliere și muzică live pe pietonalul central. Intrare liberă.", venue: { name: "Piața Victoriei", address: "Piața Victoriei, Timișoara", locality: "Timișoara", lat: 45.7535, lng: 21.2252 }, day: 6, time: "10:00", durationH: 10, categories: ["targuri", "familie"], ages: [], allAges: true, family: true, free: true, io: "outdoor", accessibility: "Acces fără trepte pe tot pietonalul (confirmat de organizator)." },
  { title: "Atelier de pictură pentru cei mici", summary: "Atelier creativ ghidat pentru copii de 3–7 ani, cu materiale incluse.", venue: { name: "Casa Tineretului", address: "Str. Arieș nr. 19, Timișoara", locality: "Timișoara", lat: 45.7411952, lng: 21.2397278 }, day: 6, time: "11:00", durationH: 1.5, categories: ["ateliere", "familie"], ages: ["3-7"], family: true, price: 40, io: "indoor" },
  { title: "Expoziție de mașini clasice", summary: "Peste 60 de automobile de epocă expuse în aer liber, cu paradă la prânz.", venue: { name: "Iulius Town", address: "Piața Consiliul Europei nr. 2, Timișoara", locality: "Timișoara", lat: 45.7663807, lng: 21.2283909 }, day: 7, time: "10:00", durationH: 7, categories: ["auto-clasic", "familie"], ages: [], allAges: true, family: true, free: true, io: "outdoor" },
  { title: "Concert simfonic de toamnă", summary: "Program cu Ceaikovski și Dvořák interpretat de orchestra filarmonicii.", venue: { name: "Sala Capitol (Filarmonica Banatul)", address: "Bd. C.D. Loga nr. 2, Timișoara", locality: "Timișoara", lat: 45.7505647, lng: 21.2262177 }, day: 5, time: "19:00", durationH: 2, categories: ["concerte"], ages: ["13-17", "18-64", "65+"], minAge: 7, price: 60, io: "indoor" },
  { title: "Seară de stand-up comedy", summary: "Trei comedianți, material nou. Acces strict 18+.", venue: { name: "Casa Tineretului", address: "Str. Arieș nr. 19, Timișoara", locality: "Timișoara", lat: 45.7411952, lng: 21.2397278 }, day: 6, time: "21:00", durationH: 2, categories: ["teatru", "viata-de-noapte"], ages: ["18-64"], minAge: 18, price: 70, io: "indoor" },
  { title: "Drumeție ușoară în Pădurea Verde", summary: "Traseu de 6 km potrivit începătorilor, cu ghid voluntar.", venue: { name: "Pădurea Verde – intrarea principală", address: "Calea Dorobanților, Timișoara", locality: "Timișoara", lat: 45.7694, lng: 21.2853 }, day: 7, time: "09:30", durationH: 3, categories: ["aer-liber", "sport"], ages: ["8-12", "13-17", "18-64", "65+"], family: true, free: true, io: "outdoor" },
  { title: "Degustare de vinuri la cramă", summary: "Tur al cramei și degustare ghidată din soiuri locale.", venue: { name: "Crama din Recaș (demo)", address: "Recaș, jud. Timiș", locality: "Recaș", lat: 45.7907, lng: 21.5049 }, day: 6, time: "16:00", durationH: 3, categories: ["gastronomie", "tururi"], ages: ["18-64", "65+"], minAge: 18, price: 120, io: "mixed" },
  { title: "Ziua familiei în Dumbrăvița", summary: "Jocuri, teatru de păpuși și ateliere în parcul central.", venue: { name: "Parcul central Dumbrăvița", address: "Dumbrăvița, jud. Timiș", locality: "Dumbrăvița", lat: 45.7972, lng: 21.2422 }, day: 7, time: "11:00", durationH: 5, categories: ["familie", "aer-liber"], ages: [], allAges: true, family: true, free: true, io: "outdoor" },
  { title: "Club de șah pentru seniori", summary: "Întâlnire săptămânală prietenoasă pentru jucători de toate nivelurile.", venue: { name: "Muzeul Banatului (Castelul Huniade)", address: "Piața Iancu Huniade nr. 1, Timișoara", locality: "Timișoara", lat: 45.7530496, lng: 21.2270516 }, day: 1, time: "10:00", durationH: 2, categories: ["seniori", "comunitate"], ages: ["65+"], free: true, io: "indoor" },
  { title: "Plimbare în parcul balnear Buziaș", summary: "Tur ghidat al parcului și al izvoarelor minerale.", venue: { name: "Parcul balnear Buziaș", address: "Buziaș, jud. Timiș", locality: "Buziaș", lat: 45.6492, lng: 21.6042 }, day: 6, time: "14:00", durationH: 2, categories: ["tururi", "aer-liber"], ages: ["18-64", "65+"], family: true, free: true, io: "outdoor" },
  { title: "Proiecție de film pentru adolescenți", summary: "Film urmat de discuție moderată, pentru 13–17 ani.", venue: { name: "Casa Tineretului", address: "Str. Arieș nr. 19, Timișoara", locality: "Timișoara", lat: 45.7411952, lng: 21.2397278 }, day: 0, time: "18:00", durationH: 2, categories: ["cinema"], ages: ["13-17"], minAge: 12, free: true, io: "indoor" },
  { title: "Concert în aer liber (ANULAT)", summary: "Concertul a fost anulat de organizator din cauza vremii.", status: "canceled", venue: { name: "Parcul Rozelor", address: "Parcul Rozelor, Timișoara", locality: "Timișoara", lat: 45.7499905, lng: 21.2323892 }, day: 6, time: "19:00", durationH: 2, categories: ["concerte"], ages: ["13-17", "18-64"], free: true, io: "outdoor" },
  { title: "Muzeul Satului Bănățean", kind: "evergreen", summary: "Muzeu în aer liber cu gospodării tradiționale bănățene.", venue: { name: "Muzeul Satului Bănățean", address: "Str. Avram Imbroane nr. 31, Timișoara", locality: "Timișoara", lat: 45.7790109, lng: 21.2644882 }, categories: ["muzee", "aer-liber"], ages: [], allAges: true, family: true, io: "outdoor", uncertainty: "Programul de vizitare nu este verificat — consultați site-ul muzeului înainte de vizită." },
  { title: "Bastionul Maria Theresia", kind: "evergreen", summary: "Fortificație din secolul XVIII, azi spațiu cultural cu expoziții.", venue: { name: "Bastionul Maria Theresia", address: "Str. Hector / Str. Martin Luther, Timișoara", locality: "Timișoara", lat: 45.7569331, lng: 21.2346116 }, categories: ["muzee", "cultural"], ages: [], allAges: true, family: true, io: "indoor", uncertainty: "Programul de vizitare nu este verificat." },
  // These two show the safeguards: never visible publicly.
  { title: "Festival în Oradea (respins: în afara razei)", summary: "Exemplu de eveniment respins automat — Oradea este la ~140 km.", status: "rejected", reviewReason: "out_of_radius", venue: { name: "Cetatea Oradea", address: "Oradea", locality: "Oradea", lat: 47.0549163, lng: 21.9285231 }, day: 6, time: "18:00", categories: ["festivaluri"], ages: ["18-64"], free: false, io: "outdoor" },
  { title: "Eveniment cu locație neclară (în revizuire)", summary: "Exemplu de eveniment trimis la verificare: locația nu a putut fi confirmată.", status: "needs_review", reviewReason: "venue_not_found", venue: { name: "„La Ion în curte”", address: "", locality: "", lat: null, lng: null }, day: 6, time: "17:00", categories: ["comunitate"], ages: ["18-64"], io: "outdoor" },
];

function dayFromToday(today: DateTime, d: number): DateTime {
  if (d === 0 || d === 1) return today.plus({ days: d });
  // d = ISO weekday of the next occurrence (5 = Friday, 6 = Saturday, 7 = Sunday)
  return today.plus({ days: (d - today.weekday + 7) % 7 });
}

export async function ensureDemoData(db: Db): Promise<void> {
  if (process.env.DEMO_DATA === "off") return;
  const [{ n }] = await db.query<{ n: number }>(`select count(*)::int n from events`);
  if (n > 0) return;
  const today = DateTime.now().setZone(TIMEZONE).startOf("day");

  for (const d of DEMO) {
    await db.tx(async (t) => {
      const [venue] = await t.query<{ id: string }>(
        `insert into venues (name, name_norm, address, locality, location, geo_status, geo_source, geo_confidence, verified_at)
         values ($1, '', nullif($2, ''), coalesce(nullif($3, ''), 'necunoscut'),
                 case when $4::float8 is null then null else st_setsrid(st_makepoint($5, $4), 4326)::geography end,
                 case when $4::float8 is null then 'unverified' else 'verified' end, 'demo', 1, now())
         on conflict (name_norm, locality) do update set address = excluded.address
         returning id`,
        [d.venue.name, d.venue.address, d.venue.locality, d.venue.lat, d.venue.lng],
      );
      const day = d.day !== undefined ? dayFromToday(today, d.day) : null;
      const slug = `${slugify(d.title)}${day ? "-" + day.toFormat("yyyy-LL-dd") : ""}`;
      const [ev] = await t.query<{ id: string }>(
        `insert into events (slug, kind, status, title, summary, venue_id, indoor_outdoor, official_min_age, all_ages, family_friendly,
                             accessibility, is_free, price_min, price_max, currency, uncertainty_note, review_reason, primary_source_id, is_demo)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$13,$14,$15,$16,'admin',true) returning id`,
        [slug, d.kind ?? "scheduled", d.status ?? "published", d.title, d.summary, venue.id, d.io, d.minAge ?? null, Boolean(d.allAges),
         Boolean(d.family), d.accessibility ?? null, d.free ?? (d.price ? false : null), d.price ?? (d.free ? 0 : null),
         d.price || d.free ? "RON" : null, d.uncertainty ?? null, d.reviewReason ?? null],
      );
      if (day && d.time) {
        const start = DateTime.fromISO(`${day.toISODate()}T${d.time}`, { zone: TIMEZONE });
        await t.query(`insert into event_sessions (event_id, starts_at, ends_at, status) values ($1, $2, $3, $4)`, [
          ev.id, start.toISO(), d.durationH ? start.plus({ minutes: d.durationH * 60 }).toISO() : null,
          d.status === "canceled" ? "canceled" : "scheduled",
        ]);
      }
      for (const c of d.categories) await t.query(`insert into event_categories values ($1, $2)`, [ev.id, c]);
      for (const a of d.ages) await t.query(`insert into event_age_groups (event_id, age_group_id, source) values ($1, $2, 'admin')`, [ev.id, a]);
      await t.query(`insert into event_sources (event_id, source_id, external_id, url) values ($1, 'admin', $2, $3)`, [
        ev.id, `demo-${slug}`, "/despre#demo",
      ]);
    });
  }
}
