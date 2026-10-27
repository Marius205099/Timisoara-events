import type { Metadata } from "next";
import Link from "next/link";
import { SOURCES } from "@/ingestion/sources";
import { TIMISOARA_CENTER } from "@/lib/config";

export const metadata: Metadata = {
  title: "Despre și surse",
  description: "Cum alegem evenimentele: doar locații verificate la maximum 50 km de centrul Timișoarei, din surse publice.",
  alternates: { canonical: "/despre" },
};

export default function About() {
  return (
    <main className="prose-slate mx-auto max-w-2xl px-4 pb-10 pt-[calc(0.75rem+env(safe-area-inset-top))]">
      <Link href="/" className="btn -ml-2 text-brand-700">← Înapoi</Link>
      <h1 className="mt-2 text-2xl font-extrabold">Despre „Ce facem în Timișoara?”</h1>

      <h2 className="mt-6 text-lg font-bold">Regula de 50 km</h2>
      <p className="mt-2 text-slate-700">
        Publicăm doar evenimente al căror loc de desfășurare are coordonate verificate la cel mult 50 km în linie dreaptă de centrul
        Timișoarei ({TIMISOARA_CENTER.lat}, {TIMISOARA_CENTER.lng}). Distanța se calculează geodezic (elipsoidul WGS84) pentru adresa
        locului — nu pentru sediul organizatorului, județ sau numele localității. Evenimentele exclusiv online nu sunt incluse. Dacă locația
        nu poate fi confirmată, evenimentul ajunge la un moderator și nu este publicat automat.
      </p>

      <h2 className="mt-6 text-lg font-bold">Vârste</h2>
      <p className="mt-2 text-slate-700">
        Restricțiile oficiale de vârstă (de ex. 18+) sunt preluate exact de la organizator. Grupele de vârstă recomandate sunt orientative,
        generate automat și verificate de moderatori — nu înlocuiesc regulile organizatorului.
      </p>

      <h2 className="mt-6 text-lg font-bold">Surse</h2>
      <p className="mt-2 text-slate-700">
        Colectăm automat de două ori pe zi (06:00 și 18:00) din surse publice care permit acest lucru, respectând robots.txt și termenii
        acestora. Fiecare eveniment are link către sursa originală.
      </p>
      <ul className="mt-2 list-disc space-y-1 pl-5 text-slate-700">
        {SOURCES.filter((s) => s.adapter !== "manual").map((s) => (
          <li key={s.id}>
            <a href={s.homepage} className="text-brand-700 underline" target="_blank" rel="noopener">{s.name}</a>
          </li>
        ))}
        <li>Evenimente trimise de organizatori prin <Link href="/adauga-eveniment" className="text-brand-700 underline">formularul public</Link> (moderate).</li>
      </ul>

      <h2 id="demo" className="mt-6 text-lg font-bold">Date demonstrative</h2>
      <p className="mt-2 text-slate-700">
        Când platforma rulează fără baza de date de producție, afișează câteva exemple marcate clar cu „DEMO”. Acestea nu sunt evenimente
        reale și nu sunt indexate de motoarele de căutare.
      </p>

      <h2 className="mt-6 text-lg font-bold">Corecturi</h2>
      <p className="mt-2 text-slate-700">
        Ați găsit o informație greșită? Verificați întotdeauna sursa oficială și semnalați-ne eroarea prin formularul de trimitere.
      </p>
    </main>
  );
}
