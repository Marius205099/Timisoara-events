import type { AttendanceMode, EventKind } from "@/lib/types";

/** What an adapter extracts from a source — raw facts only, nothing inferred. */
export interface RawEvent {
  sourceId: string;
  externalId: string;
  url: string;
  title: string;
  description?: string | null;
  imageUrl?: string | null;
  kind: EventKind;
  sessions: { startsAt: string; endsAt?: string | null; allDay?: boolean }[];
  status?: "scheduled" | "canceled" | "postponed";
  attendanceMode?: AttendanceMode;
  /** The physical place where the event happens. */
  venue: {
    name?: string | null;
    address?: string | null;
    locality?: string | null;
    lat?: number | null;
    lng?: number | null;
  };
  /** Organizer — kept apart from the venue and NEVER used for location. */
  organizer?: { name?: string | null; address?: string | null } | null;
  officialAgeText?: string | null;
  isFree?: boolean | null;
  priceMin?: number | null;
  priceMax?: number | null;
  currency?: string | null;
  ticketUrl?: string | null;
  categoryHints?: string[];
  /** Factual notice from the source shown to visitors, e.g. "Reprogramat (data inițială: …)". */
  notice?: string | null;
}

export interface AdapterContext {
  fetchText: (url: string, accept?: string) => Promise<string>;
  now: Date;
  log: (msg: string) => void;
}

export interface SourceAdapter {
  /** Matches `sources.adapter` in the database. */
  id: string;
  fetch(config: Record<string, unknown>, ctx: AdapterContext): Promise<RawEvent[]>;
}
