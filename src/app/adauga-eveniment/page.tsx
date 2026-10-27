import type { Metadata } from "next";
import Link from "next/link";
import { SubmitForm } from "./SubmitForm";

export const metadata: Metadata = {
  title: "Adaugă un eveniment",
  description: "Trimite gratuit un eveniment din Timișoara sau de la maximum 50 km. Toate trimiterile sunt verificate.",
  alternates: { canonical: "/adauga-eveniment" },
};

export default function Page() {
  return (
    <main className="mx-auto max-w-2xl px-4 pb-10 pt-[calc(0.75rem+env(safe-area-inset-top))]">
      <Link href="/" className="btn -ml-2 text-brand-700">← Înapoi</Link>
      <h1 className="mt-2 text-2xl font-extrabold">Adaugă un eveniment</h1>
      <p className="mt-2 text-slate-600">
        Gratuit. Publicăm doar evenimente fizice, cu adresă verificabilă, aflate la maximum 50 km (linie dreaptă) de centrul Timișoarei.
        Fiecare trimitere este verificată de un moderator înainte de publicare.
      </p>
      <SubmitForm />
    </main>
  );
}
