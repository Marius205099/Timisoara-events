import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ageSummary, priceLabel } from "@/components/EventCard";
import { getDb } from "@/data/db";
import { getPublicEventBySlug } from "@/data/public";
import { officialAgeLabel } from "@/lib/age";
import { SITE_URL } from "@/lib/config";
import { formatDateRo, formatSessionRo } from "@/lib/dates";
import { directionsUrl, formatKm, osmEmbedUrl } from "@/lib/geo";
import { ageGroupLabel, categoryEmoji, categoryLabel } from "@/lib/taxonomy";
import type { PublicEvent } from "@/lib/types";

export const dynamic = "force-dynamic";

type Params = Promise<{ slug: string }>;

async function load(slug: string) {
  return getPublicEventBySlug(await getDb(), slug);
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const e = await load((await params).slug);
  if (!e) return { title: "Eveniment negăsit", robots: { index: false } };
  const s = e.sessions[0];
  const when = s ? formatSessionRo(s.startsAt, s.endsAt, s.allDay) : "";
  const description = `${when}${when ? " · " : ""}${e.venue.name}, ${e.venue.locality}. ${e.summary}`.slice(0, 300);
  return {
    title: e.title,
    description,
    alternates: { canonical: `/eveniment/${e.slug}` },
    openGraph: { title: e.title, description, url: `${SITE_URL}/eveniment/${e.slug}`, type: "article" },
    robots: e.isDemo ? { index: false } : undefined,
  };
}

/** schema.org Event structured data — only facts we actually have. */
function jsonLd(e: PublicEvent) {
  if (e.kind !== "scheduled") return null;
  return e.sessions.slice(0, 20).map((s) => ({
    "@context": "https://schema.org",
    "@type": "Event",
    name: e.title,
    description: e.summary,
    startDate: s.startsAt,
    ...(s.endsAt ? { endDate: s.endsAt } : {}),
    eventStatus: e.status === "canceled" || s.status === "canceled" ? "https://schema.org/EventCancelled" : s.status === "postponed" ? "https://schema.org/EventPostponed" : "https://schema.org/EventScheduled",
    eventAttendanceMode: e.attendanceMode === "hybrid" ? "https://schema.org/MixedEventAttendanceMode" : "https://schema.org/OfflineEventAttendanceMode",
    location: {
      "@type": "Place",
      name: e.venue.name,
      address: { "@type": "PostalAddress", streetAddress: e.venue.address ?? undefined, addressLocality: e.venue.locality, addressCountry: "RO" },
      ...(e.venue.lat != null ? { geo: { "@type": "GeoCoordinates", latitude: e.venue.lat, longitude: e.venue.lng } } : {}),
    },
    ...(e.organizer ? { organizer: { "@type": "Organization", name: e.organizer } } : {}),
    ...(e.isFree || e.priceMin != null
      ? { offers: { "@type": "Offer", price: e.isFree ? 0 : e.priceMin, priceCurrency: e.currency ?? "RON", url: e.ticketUrl ?? e.sources[0]?.url } }
      : {}),
    ...(e.officialMinAge ? { typicalAgeRange: `${e.officialMinAge}-` } : {}),
    url: `${SITE_URL}/eveniment/${e.slug}`,
  }));
}

export default async function EventPage({ params }: { params: Params }) {
  const e = await load((await params).slug);
  if (!e) notFound();
  const canceled = e.status === "canceled";
  const price = priceLabel(e);
  const official = officialAgeLabel(e);
  const ld = jsonLd(e);
  const upcoming = e.sessions.filter((s) => new Date(s.endsAt ?? s.startsAt) > new Date(Date.now() - 3600_000));

  return (
    <main className="mx-auto max-w-3xl px-4 pb-10 pt-[calc(0.75rem+env(safe-area-inset-top))]">
      {ld && !e.isDemo && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(ld).replace(/</g, "\\u003c") }} />}
      <Link href="/" className="btn -ml-2 text-brand-700">← Înapoi la evenimente</Link>

      <div className="card mt-2 overflow-hidden">
        <div className="flex h-36 items-center justify-center bg-gradient-to-br from-brand-100 to-orange-100 text-7xl" aria-hidden>
          {e.imageUrl && e.imageCredit ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={e.imageUrl} alt="" className="h-full w-full object-cover" />
          ) : (
            categoryEmoji(e.categories[0] ?? "")
          )}
        </div>
        <div className="p-5">
          <div className="mb-2 flex flex-wrap gap-1.5">
            {e.isDemo && <span className="badge bg-amber-400 text-amber-950">DEMO — exemplu, nu eveniment real</span>}
            {canceled && <span className="badge bg-red-100 text-red-800">ANULAT</span>}
            {e.categories.map((c) => (
              <span key={c} className="badge bg-slate-100 text-slate-700">{categoryLabel(c)}</span>
            ))}
          </div>
          <h1 className={`text-2xl font-extrabold leading-tight ${canceled ? "line-through" : ""}`}>{e.title}</h1>
          {e.summary && <p className="mt-2 text-[17px] text-slate-700">{e.summary}</p>}

          {(canceled || e.uncertaintyNote) && (
            <div role="alert" className={`mt-4 rounded-xl p-3 text-sm ${canceled ? "bg-red-50 text-red-900" : "bg-amber-50 text-amber-900"}`}>
              {canceled ? "Acest eveniment a fost anulat conform sursei. " : ""}
              {e.uncertaintyNote}
            </div>
          )}

          <dl className="mt-5 space-y-4 text-[15px]">
            <Row label={e.kind === "evergreen" ? "Program" : "Când"}>
              {e.kind === "evergreen" ? (
                e.openingHours?.weekly ? (
                  <ul>{Object.entries(e.openingHours.weekly).map(([d, h]) => <li key={d}>{d}: {h}</li>)}</ul>
                ) : (
                  <span>Program de vizitare neconfirmat — verificați la sursă înainte de vizită.</span>
                )
              ) : (
                <ul className="space-y-1">
                  {(upcoming.length ? upcoming : e.sessions).slice(0, 12).map((s) => (
                    <li key={s.id} className={s.status === "canceled" ? "line-through text-slate-400" : "font-semibold"}>
                      {formatSessionRo(s.startsAt, s.endsAt, s.allDay)}
                      {s.status === "canceled" && " (anulat)"}
                      {s.status === "postponed" && " (amânat)"}
                    </li>
                  ))}
                </ul>
              )}
            </Row>
            <Row label="Unde">
              <span className="font-semibold">{e.venue.name}</span>
              <br />
              {e.venue.address && e.venue.address.toLowerCase().includes(e.venue.locality.toLowerCase())
                ? e.venue.address
                : [e.venue.address, e.venue.locality].filter(Boolean).join(", ")}
              <br />
              <span className="text-slate-500">{formatKm(e.venue.distanceKm ?? 0)} de centrul Timișoarei (distanță în linie dreaptă)</span>
            </Row>
            <Row label="Vârstă">
              {official ? <span className="font-semibold">{official}</span> : <span>Fără restricție oficială publicată.</span>}
              <br />
              <span className="text-slate-600">
                Recomandat: {e.allAges ? "toate vârstele" : e.recommendedAgeGroups.map(ageGroupLabel).join(", ") || ageSummary(e)}
                {e.familyFriendly && " · potrivit pentru familii"}
              </span>
              <br />
              <span className="text-xs text-slate-400">Recomandările de vârstă sunt orientative; restricțiile oficiale sunt cele publicate de organizator.</span>
            </Row>
            {price && <Row label="Preț">{price}</Row>}
            {e.organizer && <Row label="Organizator">{e.organizer}</Row>}
            {e.accessibility && <Row label="Accesibilitate">{e.accessibility}</Row>}
          </dl>

          <div className="mt-6 grid gap-2 sm:grid-cols-2">
            {e.ticketUrl && !canceled && (
              <a href={e.ticketUrl} target="_blank" rel="noopener nofollow" className="btn-primary">Bilete / rezervare ↗</a>
            )}
            {e.venue.lat != null && (
              <a href={directionsUrl({ lat: e.venue.lat, lng: e.venue.lng! })} target="_blank" rel="noopener" className="btn-ghost">🧭 Indicații de orientare</a>
            )}
          </div>
        </div>
      </div>

      {e.venue.lat != null && (
        <div className="card mt-4 overflow-hidden">
          <iframe
            title={`Hartă: ${e.venue.name}`}
            src={osmEmbedUrl({ lat: e.venue.lat, lng: e.venue.lng! })}
            className="h-64 w-full border-0"
            loading="lazy"
            referrerPolicy="no-referrer"
          />
          <p className="px-4 py-2 text-xs text-slate-500">Hartă © colaboratorii OpenStreetMap</p>
        </div>
      )}

      {e.description && (
        <details className="card mt-4 p-5">
          <summary className="cursor-pointer font-semibold">Descrierea de la sursă</summary>
          <p className="mt-3 whitespace-pre-line text-[15px] text-slate-700">{e.description.slice(0, 1200)}{e.description.length > 1200 ? "…" : ""}</p>
        </details>
      )}

      <section className="card mt-4 p-5 text-sm text-slate-600">
        <h2 className="mb-2 font-bold text-slate-800">Surse</h2>
        <ul className="space-y-1">
          {e.sources.map((s) => (
            <li key={s.sourceId + s.url}>
              {s.url.startsWith("http") ? (
                <a href={s.url} target="_blank" rel="noopener" className="text-brand-700 underline">{s.sourceName} ↗</a>
              ) : (
                <span>{s.sourceName}</span>
              )}
            </li>
          ))}
        </ul>
        <p className="mt-2">Ultima verificare: {formatDateRo(e.lastVerifiedAt)}</p>
        <p className="mt-1">Datele pot fi modificate de organizator. Verificați întotdeauna la sursa oficială înainte de deplasare.</p>
      </section>
    </main>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[96px_1fr] gap-3">
      <dt className="font-semibold text-slate-500">{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}
