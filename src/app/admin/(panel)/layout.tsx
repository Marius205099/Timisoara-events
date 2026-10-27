import type { Metadata } from "next";
import Link from "next/link";
import { logoutAction } from "../actions";
import { requireAdmin } from "@/lib/auth";

export const metadata: Metadata = { title: "Admin", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";
export const maxDuration = 300; // manual ingestion can take minutes

const NAV = [
  ["/admin", "Panou"],
  ["/admin/evenimente?status=needs_review", "De verificat"],
  ["/admin/evenimente?status=all", "Toate evenimentele"],
  ["/admin/trimiteri", "Trimiteri"],
  ["/admin/duplicate", "Duplicate"],
  ["/admin/surse", "Surse & colectare"],
] as const;

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const admin = await requireAdmin();
  return (
    <div className="mx-auto max-w-6xl px-4 pb-10 pt-[calc(0.75rem+env(safe-area-inset-top))]">
      <header className="mb-4 flex flex-wrap items-center gap-2">
        <Link href="/admin" className="mr-2 text-lg font-extrabold">🛠️ Admin</Link>
        <nav className="flex flex-wrap gap-1">
          {NAV.map(([href, label]) => (
            <Link key={href} href={href} className="rounded-lg px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100">{label}</Link>
          ))}
        </nav>
        <form action={logoutAction} className="ml-auto flex items-center gap-2 text-sm text-slate-500">
          <span>{admin.email}</span>
          <button className="btn-ghost min-h-[36px] px-3 text-sm">Ieșire</button>
        </form>
      </header>
      {children}
    </div>
  );
}
