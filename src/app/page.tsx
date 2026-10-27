import Link from "next/link";
import { Suspense } from "react";
import { DateTime } from "luxon";
import { Controls } from "@/components/Controls";
import { EventCard, eventDayKey } from "@/components/EventCard";
import { getDb } from "@/data/db";
import { listPublicEvents } from "@/data/public";
import { TIMEZONE } from "@/lib/config";
import { applyFilters, localitiesOf } from "@/lib/filters";
import { parseQuery } from "@/lib/query";

export const dynamic = "force-dynamic";

type SP = Promise<Record<string, string | string[] | undefined>>;

export default async function Home({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const q = parseQuery(sp);
  const db = await getDb();
  const inWindow = await listPublicEvents(db, q.filters.from, q.filters.to);
  const events = applyFilters(inWindow, q.filters);
  const scheduled = events.filter((e) => e.kind === "scheduled");
  const evergreen = events.filter((e) => e.kind === "evergreen");
  const hasDemo = events.some((e) => e.isDemo);

  // Group scheduled events by local day when the window spans several days.
  const groups = new Map<string, typeof scheduled>();
  for (const e of scheduled) {
    const k = eventDayKey(e, q.filters.from);
    groups.set(k, [...(groups.get(k) ?? []), e]);
  }
  const multiDay = groups.size > 1;

  return (
    <main className="mx-auto max-w-5xl">
      <header className="bg-gradient-to-b from-brand-700 to-brand-600 px-4 pb-6 pt-[calc(1.25rem+env(safe-area-inset-top))] text-white">
        <h1 className="text-[28px] font-extrabold leading-tight tracking-tight sm:text-4xl">Ce facem în Timișoara?</h1>
        <p className="mt-1 text-[15px] text-blue-100">Evenimente și activități în Timișoara și la maximum 50 km.</p>
      </header>

      {hasDemo && (
        <div role="note" className="mx-4 mt-3 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          <strong>Mod demonstrativ:</strong> evenimentele marcate „DEMO” sunt exemple, nu evenimente reale.{" "}
          <Link href="/despre#demo" className="underline">Detalii</Link>
        </div>
      )}

      <div className="sticky top-0 z-30 -mt-px bg-slate-50/95 pb-3 pt-3 backdrop-blur supports-[backdrop-filter]:bg-slate-50/80">
        <Suspense>
          <Controls localities={localitiesOf(inWindow)} activeQuick={q.quick} date={q.date} />
        </Suspense>
      </div>

      <section aria-live="polite" className="px-4">
        <h2 className="mb-3 text-lg font-bold text-slate-800">
          {q.label} <span className="font-normal text-slate-500">· {scheduled.length} {scheduled.length === 1 ? "eveniment" : "evenimente"}</span>
        </h2>

        {scheduled.length === 0 && (
          <div className="card p-6 text-center text-slate-600">
            <p className="text-3xl" aria-hidden>🔍</p>
            <p className="mt-2 font-semibold">Niciun eveniment programat pentru aceste filtre.</p>
            <p className="mt-1 text-sm">
              Încercați altă zi sau eliminați câteva filtre.{evergreen.length > 0 && " Mai jos găsiți atracții care pot fi vizitate oricând."}
            </p>
          </div>
        )}

        {[...groups.entries()].map(([day, list]) => (
          <div key={day} className="mb-6">
            {multiDay && (
              <h3 className="mb-2 text-sm font-bold uppercase tracking-wide text-slate-500">
                {DateTime.fromISO(day, { zone: TIMEZONE }).setLocale("ro").toFormat("cccc, d LLLL")}
              </h3>
            )}
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {list.map((e) => (
                <EventCard key={e.id} e={e} fromIso={q.filters.from} />
              ))}
            </div>
          </div>
        ))}

        {evergreen.length > 0 && (
          <div className="mt-8">
            <h2 className="mb-1 text-lg font-bold text-slate-800">Atracții care pot fi vizitate oricând</h2>
            <p className="mb-3 text-sm text-slate-500">Nu sunt evenimente programate — verificați programul înainte de vizită.</p>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {evergreen.map((e) => (
                <EventCard key={e.id} e={e} />
              ))}
            </div>
          </div>
        )}

        <div className="card mt-8 flex flex-col items-start gap-2 p-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-slate-600">Organizați un eveniment în Timișoara sau în apropiere?</p>
          <Link href="/adauga-eveniment" className="btn-primary">Trimite-l gratuit</Link>
        </div>
      </section>
    </main>
  );
}
