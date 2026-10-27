import type { Metadata, Viewport } from "next";
import Link from "next/link";
import "./globals.css";
import { SITE_NAME, SITE_URL } from "@/lib/config";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: `${SITE_NAME} Evenimente azi și în weekend`, template: `%s · Ce facem în Timișoara?` },
  description: "Evenimente și activități în Timișoara și la maximum 50 km: concerte, teatru, expoziții, activități pentru copii, familii și seniori.",
  applicationName: SITE_NAME,
  alternates: { canonical: "/" },
  openGraph: { type: "website", locale: "ro_RO", siteName: SITE_NAME, url: SITE_URL },
  twitter: { card: "summary_large_image" },
  appleWebApp: { capable: true, title: "Ce facem?", statusBarStyle: "default" },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#1d4ed8",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ro">
      <body className="min-h-dvh">
        <a href="#continut" className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded focus:bg-white focus:p-2">
          Sari la conținut
        </a>
        <div id="continut">{children}</div>
        <footer className="mx-auto mt-10 max-w-5xl px-4 pb-[calc(2rem+var(--safe-bottom))] text-sm text-slate-500">
          <nav className="flex flex-wrap gap-x-4 gap-y-2">
            <Link href="/" className="underline-offset-2 hover:underline">Acasă</Link>
            <Link href="/adauga-eveniment" className="underline-offset-2 hover:underline">Adaugă un eveniment</Link>
            <Link href="/despre" className="underline-offset-2 hover:underline">Despre & surse</Link>
          </nav>
          <p className="mt-3">
            Doar evenimente cu locație verificată la maximum 50 km de centrul Timișoarei. Verificați întotdeauna detaliile la sursa oficială.
          </p>
        </footer>
      </body>
    </html>
  );
}
