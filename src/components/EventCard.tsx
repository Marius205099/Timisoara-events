import Link from "next/link";
import { DateTime } from "luxon";
import { officialAgeLabel } from "@/lib/age";
import { TIMEZONE } from "@/lib/config";
import { formatSessionRo } from "@/lib/dates";
import { formatKm } from "@/lib/geo";
import { ageGroupLabel, categoryEmoji, categoryLabel } from "@/lib/taxonomy";
import type { PublicEvent } from "@/lib/types";

export function priceLabel(e: Pick<PublicEvent, "isFree" | "priceMin" | "priceMax" | "currency">): string | null {
  if (e.isFree) return "Gratuit";
  if (e.priceMin != null) {
    const c = e.currency ?? "RON";
    const fmt = (n: number) => n.toLocaleString("ro-RO", { maximumFractionDigits: 0 });
    return e.priceMax != null && e.priceMax !== e.priceMin ? `${fmt(e.priceMin)}–${fmt(e.priceMax)} ${c}` : `de la ${fmt(e.priceMin)} ${c}`;
  }
  return null;
}

export function ageSummary(e: PublicEvent): string {
  const official = officialAgeLabel(e);
  if (official && (e.officialMinAge ?? 0) >= 18) return "Doar 18+";
  if (e.allAges) return "Toate vârstele";
  const groups = e.recommendedAgeGroups.map(ageGroupLabel).join(", ");
  return groups || (official ?? "Vârstă nespecificată");
}

/** First session inside the selected window (or the next upcoming one). */
export function pickSession(e: PublicEvent, fromIso?: string) {
  const from = fromIso ? DateTime.fromISO(fromIso) : DateTime.now().minus({ hours: 2 });
  return (
    e.sessions.find((s) => DateTime.fromISO(s.endsAt ?? s.startsAt) >= from) ?? e.sessions[e.sessions.length - 1] ?? null
  );
}

export function EventCard({ e, fromIso }: { e: PublicEvent; fromIso?: string }) {
  const s = pickSession(e, fromIso);
  const price = priceLabel(e);
  const cat = e.categories[0];
  const canceled = e.status === "canceled" || s?.status === "canceled";
  const showImage = Boolean(e.imageUrl && e.imageCredit); // only images we have a usage basis for
  const moreDates = e.sessions.filter((x) => DateTime.fromISO(x.startsAt) > DateTime.now()).length - 1;

  return (
    <article className={`card overflow-hidden ${canceled ? "opacity-75" : ""}`}>
      <Link href={`/eveniment/${e.slug}`} className="flex gap-3 p-3 sm:flex-col sm:p-0">
        <div className="relative h-24 w-24 shrink-0 overflow-hidden rounded-xl bg-gradient-to-br from-brand-100 to-orange-100 sm:h-40 sm:w-full sm:rounded-none">
          {showImage ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={e.imageUrl!} alt="" loading="lazy" className="h-full w-full object-cover" />
          ) : (
            <span aria-hidden className="flex h-full items-center justify-center text-4xl sm:text-6xl">{categoryEmoji(cat ?? "")}</span>
          )}
          {e.isDemo && <span className="badge absolute left-1 top-1 bg-amber-400 text-amber-950">DEMO</span>}
        </div>
        <div className="min-w-0 flex-1 sm:p-4">
          {canceled && <p className="badge mb-1 bg-red-100 text-red-800">ANULAT</p>}
          <h3 className={`line-clamp-2 text-[17px] font-bold leading-snug text-slate-900 ${canceled ? "line-through" : ""}`}>{e.title}</h3>
          <p className="mt-1 text-[15px] font-semibold text-brand-700">
            {e.kind === "evergreen"
              ? e.openingHours?.weekly ? "Program verificat — vezi detalii" : "Atracție permanentă · program neconfirmat"
              : s ? formatSessionRo(s.startsAt, s.endsAt, s.allDay) : ""}
            {moreDates > 0 && <span className="font-normal text-slate-500"> · +{moreDates} date</span>}
          </p>
          <p className="mt-0.5 truncate text-sm text-slate-600">
            {e.venue.name}
            {e.venue.locality && e.venue.locality !== "Timișoara" ? `, ${e.venue.locality}` : ""} · {formatKm(e.venue.distanceKm ?? 0)}
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {cat && <span className="badge bg-slate-100 text-slate-700">{categoryLabel(cat)}</span>}
            <span className={`badge ${(e.officialMinAge ?? 0) >= 18 ? "bg-rose-100 text-rose-800" : e.allAges ? "bg-emerald-100 text-emerald-800" : "bg-sky-100 text-sky-800"}`}>
              {ageSummary(e)}
            </span>
            {price && <span className={`badge ${e.isFree ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-700"}`}>{price}</span>}
          </div>
          <p className="mt-2 text-xs text-slate-400">Sursa: {e.sources.map((x) => x.sourceName).join(", ") || "—"}</p>
        </div>
      </Link>
    </article>
  );
}

export function eventDayKey(e: PublicEvent, fromIso?: string): string {
  const s = pickSession(e, fromIso);
  return s ? DateTime.fromISO(s.startsAt).setZone(TIMEZONE).toISODate()! : "";
}
