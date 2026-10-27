import { z } from "zod";
import { DateTime } from "luxon";
import { TIMEZONE } from "@/lib/config";
import { NominatimGeocoder, type Geocoder } from "@/ingestion/geocode";
import { verifyVenueLocation } from "@/ingestion/locate";
import { dbGeocodeCache, loadKnownVenues, processRawEvent, type SourceRow } from "@/ingestion/pipeline";
import { parsePriceText } from "@/ingestion/text";
import type { RawEvent } from "@/ingestion/types";
import type { Db } from "./db";

const url = z.string().trim().url().max(500).refine((u) => /^https?:\/\//.test(u), "URL invalid").optional().or(z.literal("").transform(() => undefined));

export const SubmissionSchema = z.object({
  title: z.string().trim().min(3, "Titlul este prea scurt").max(200),
  description: z.string().trim().max(5000).optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data este obligatorie"),
  time: z.string().regex(/^\d{2}:\d{2}$/, "Ora este obligatorie"),
  endTime: z.string().regex(/^\d{2}:\d{2}$/).optional().or(z.literal("").transform(() => undefined)),
  venueName: z.string().trim().min(2, "Numele locului este obligatoriu").max(200),
  venueAddress: z.string().trim().min(3, "Adresa este obligatorie").max(300),
  locality: z.string().trim().min(2, "Localitatea este obligatorie").max(100),
  organizerName: z.string().trim().max(200).optional(),
  officialMinAge: z.coerce.number().int().min(0).max(21).optional().or(z.literal("").transform(() => undefined)),
  priceText: z.string().trim().max(200).optional(),
  ticketUrl: url,
  sourceUrl: url,
  contactEmail: z.string().trim().email("Email invalid").max(200),
  online: z.literal("on").optional(),
});

export type SubmissionInput = z.infer<typeof SubmissionSchema>;

/**
 * Stores a public submission after a server-side location pre-check. Nothing is
 * published here: submissions always go to moderation, and those clearly
 * outside 50 km are recorded as rejected with the measured distance.
 */
export async function createSubmission(db: Db, input: SubmissionInput, geocoder?: Geocoder) {
  const start = DateTime.fromISO(`${input.date}T${input.time}`, { zone: TIMEZONE });
  if (!start.isValid) throw new Error("Data sau ora invalidă.");
  if (start < DateTime.now().minus({ days: 1 })) throw new Error("Evenimentul este în trecut.");
  let end = input.endTime ? DateTime.fromISO(`${input.date}T${input.endTime}`, { zone: TIMEZONE }) : null;
  if (end && end < start) end = end.plus({ days: 1 });

  const verdict = input.online
    ? null
    : await verifyVenueLocation(
        { name: input.venueName, address: input.venueAddress, locality: input.locality },
        "offline",
        { geocoder: geocoder ?? new NominatimGeocoder(dbGeocodeCache(db)), knownVenues: await loadKnownVenues(db) },
      );
  const status = input.online || verdict?.decision === "reject" ? "rejected" : "pending";
  const price = parsePriceText(input.priceText);

  const [row] = await db.query<{ id: string }>(
    `insert into event_submissions (status, title, description, starts_at, ends_at, venue_name, venue_address, locality, organizer_name,
        official_min_age, is_free, price_text, ticket_url, source_url, contact_email, geocode, distance_km, geo_verdict)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16::jsonb,$17,$18) returning id`,
    [status, input.title, input.description ?? null, start.toISO(), end?.toISO() ?? null, input.venueName, input.venueAddress, input.locality,
     input.organizerName ?? null, input.officialMinAge ?? null, price.isFree, input.priceText ?? null, input.ticketUrl ?? null,
     input.sourceUrl ?? null, input.contactEmail, verdict ? JSON.stringify(verdict.venue) : null, verdict?.venue.distanceKm ?? null,
     input.online ? "online_only" : verdict ? `${verdict.decision}:${verdict.reason}` : null],
  );
  return { id: row.id, status, distanceKm: verdict?.venue.distanceKm ?? null, reason: input.online ? "online_only" : verdict?.reason };
}

/** Turns an approved submission into an event (still via the pipeline + DB geofence). */
export async function approveSubmission(db: Db, adminId: string, submissionId: string, geocoder?: Geocoder) {
  const [s] = await db.query<Record<string, string | number | boolean | null>>(`select * from event_submissions where id = $1`, [submissionId]);
  if (!s) throw new Error("Trimitere inexistentă.");
  const [source] = await db.query<SourceRow>(`select id, name, adapter, config, enabled, auto_publish from sources where id = 'submissions'`);
  const raw: RawEvent = {
    sourceId: "submissions",
    externalId: String(s.id),
    url: (s.source_url as string) || (s.ticket_url as string) || "",
    title: String(s.title),
    description: (s.description as string) ?? null,
    kind: "scheduled",
    sessions: [{ startsAt: new Date(s.starts_at as string).toISOString(), endsAt: s.ends_at ? new Date(s.ends_at as string).toISOString() : null }],
    venue: { name: s.venue_name as string, address: s.venue_address as string, locality: s.locality as string },
    organizer: s.organizer_name ? { name: s.organizer_name as string } : null,
    officialAgeText: s.official_min_age != null ? `${s.official_min_age}+` : null,
    isFree: (s.is_free as boolean | null) ?? null,
    ticketUrl: (s.ticket_url as string) || null,
  };
  const r = await processRawEvent(raw, {
    db, source, geocoder: geocoder ?? new NominatimGeocoder(dbGeocodeCache(db)), knownVenues: await loadKnownVenues(db),
  });
  await db.query(`update event_submissions set status = 'approved', event_id = $2 where id = $1`, [submissionId, r.eventId]);
  await db.query(`insert into admin_reviews (submission_id, event_id, action, admin_id, reason) values ($1, $2, 'approve_submission', $3, $4)`, [
    submissionId, r.eventId, adminId, r.reason,
  ]);
  return r;
}
