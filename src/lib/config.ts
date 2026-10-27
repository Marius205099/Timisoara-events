/**
 * Central configuration. Server-side values are read from env; the geofence is
 * hard-capped at 50 km so no configuration (and no visitor) can widen it.
 */

export const TIMEZONE = "Europe/Bucharest";

/** Geographic center of Timișoara used for every distance calculation. */
export const TIMISOARA_CENTER = { lat: 45.7489, lng: 21.2087 } as const;

/** Absolute upper bound of the platform. Never exceeded, whatever the config says. */
export const HARD_MAX_RADIUS_METERS = 50_000;

function parseRadius(raw: string | undefined): number {
  const n = raw ? Number(raw) : HARD_MAX_RADIUS_METERS;
  if (!Number.isFinite(n) || n <= 0) return HARD_MAX_RADIUS_METERS;
  return Math.min(n, HARD_MAX_RADIUS_METERS);
}

/** Effective radius (meters). Configurable downwards via GEOFENCE_MAX_METERS, never above 50 km. */
export const GEOFENCE_MAX_METERS = parseRadius(process.env.GEOFENCE_MAX_METERS);

export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(/\/$/, "");
export const SITE_NAME = "Ce facem în Timișoara?";

export const isSupabaseAuthConfigured = () =>
  Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

/** Without DATABASE_URL the site runs on the embedded database (demo/local mode). */
export const isEmbeddedMode = () => !process.env.DATABASE_URL;
