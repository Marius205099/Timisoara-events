import Link from "next/link";

export default function NotFound() {
  return (
    <main className="mx-auto max-w-xl px-4 py-16 text-center">
      <p className="text-5xl" aria-hidden>🗺️</p>
      <h1 className="mt-4 text-2xl font-bold">Pagina nu a fost găsită</h1>
      <p className="mt-2 text-slate-600">Evenimentul poate fi încheiat, anulat sau în afara zonei de 50 km.</p>
      <Link href="/" className="btn-primary mt-6">Vezi evenimentele</Link>
    </main>
  );
}
