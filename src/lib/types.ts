import type { AgeGroupId, CategoryId } from "./taxonomy";

export type EventKind = "scheduled" | "evergreen";
export type EventStatus = "draft" | "needs_review" | "published" | "rejected" | "canceled" | "archived";
export type GeoStatus = "verified" | "unverified" | "out_of_radius";
export type AttendanceMode = "offline" | "online" | "hybrid";
export type IndoorOutdoor = "indoor" | "outdoor" | "mixed" | "unknown";

export interface Venue {
  id: string;
  name: string;
  address: string | null;
  locality: string;
  lat: number | null;
  lng: number | null;
  /** Geodesic distance from Timișoara center, km. Null until coordinates are verified. */
  distanceKm: number | null;
  geoStatus: GeoStatus;
  geoSource: string | null; // "source_geo" | "nominatim" | "admin" | "known_venue"
  geoConfidence: number | null; // 0..1
}

export interface EventSession {
  id: string;
  startsAt: string; // ISO with offset
  endsAt: string | null;
  allDay: boolean;
  status: "scheduled" | "canceled" | "postponed" | "sold_out";
}

export interface OpeningHours {
  /** e.g. { mon: "10:00-18:00", tue: "closed" } — only verified hours. */
  weekly: Partial<Record<"mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun", string>> | null;
  note: string | null;
}

export interface EventSourceRef {
  sourceId: string;
  sourceName: string;
  url: string;
  externalId: string | null;
  lastSeenAt: string;
}

export interface PublicEvent {
  id: string;
  slug: string;
  kind: EventKind;
  status: EventStatus;
  title: string;
  summary: string; // concise original Romanian summary
  description: string | null;
  imageUrl: string | null;
  imageCredit: string | null;
  categories: CategoryId[];
  recommendedAgeGroups: AgeGroupId[];
  allAges: boolean;
  familyFriendly: boolean;
  /** Official restrictions published by the organizer — never inferred by AI. */
  officialMinAge: number | null;
  officialMaxAge: number | null;
  accessibility: string | null; // only confirmed info
  isFree: boolean | null;
  priceMin: number | null;
  priceMax: number | null;
  currency: string | null;
  indoorOutdoor: IndoorOutdoor;
  attendanceMode: AttendanceMode;
  organizer: string | null;
  ticketUrl: string | null;
  venue: Venue;
  sessions: EventSession[];
  openingHours: OpeningHours | null;
  sources: EventSourceRef[];
  lastVerifiedAt: string;
  uncertaintyNote: string | null;
  aiConfidence: number | null;
  isDemo: boolean;
}

export interface EventFilters {
  from: string; // ISO
  to: string; // ISO
  ageGroups?: AgeGroupId[];
  familyMode?: boolean;
  categories?: CategoryId[];
  price?: "free" | "paid";
  indoorOutdoor?: "indoor" | "outdoor";
  timeOfDay?: ("morning" | "afternoon" | "evening")[];
  locality?: string;
  distanceBand?: "0-10" | "10-25" | "25-50";
  familyFriendly?: boolean;
  accessible?: boolean;
  includeEvergreen?: boolean;
  q?: string;
}
