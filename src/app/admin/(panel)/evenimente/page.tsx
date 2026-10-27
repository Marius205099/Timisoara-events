import { requireAdmin } from "@/lib/auth";
import Link from "next/link";
import { getDb } from "@/data/db";
import { adminListEvents } from "@/data/admin";
import { REASON_LABEL, StatusBadge } from "@/components/Flash";

const TABS = ["needs_review", "published", "rejected", "canceled", "archived", "all"];

export default async function EventsList({ searchParams }: { searchParams: Promise<{ status?: string; q?: string }> }) {
  await requireAdmin(); // layouts and pages render in parallel: every page checks auth itself
  const { status = "needs_review", q } = await searchParams;
  const rows = await adminListEvents(await getDb(), { status, q, limit: 300 });
  return (
    <main>
      <div className="mb-3 flex flex-wrap gap-1">
        {TABS.map((t) => (
          <Link key={t} href={`/admin/evenimente?status=${t}`} className={`chip min-h-[36px] ${t === status ? "chip-on" : ""}`}>
            {t === "all" ? "Toate" : <StatusBadge s={t} />}
          </Link>
        ))}
      </div>
      <form className="mb-3 flex gap-2">
        <input type="hidden" name="status" value={status} />
        <input name="q" defaultValue={q} placeholder="Caută titlu sau loc" className="input max-w-sm" />
        <button className="btn-ghost">Caută</button>
      </form>
      <div className="card overflow-x-auto">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead className="bg-slate-50 text-slate-500">
            <tr><th className="p-3">Eveniment</th><th>Data</th><th>Loc</th><th>Distanță</th><th>Geo</th><th>Status</th><th>Surse</th></tr>
          </thead>
          <tbody>
            {rows.map((e) => (
              <tr key={e.id} className="border-t align-top hover:bg-slate-50">
                <td className="p-3">
                  <Link href={`/admin/evenimente/${e.id}`} className="font-semibold text-brand-700 hover:underline">{e.title}</Link>
                  {e.is_demo && <span className="badge ml-1 bg-amber-300">DEMO</span>}
                  {e.review_reason && <div className="text-xs text-slate-500">{REASON_LABEL[e.review_reason] ?? e.review_reason}</div>}
                </td>
                <td className="whitespace-nowrap">{e.first_start ? new Date(e.first_start).toLocaleString("ro-RO", { timeZone: "Europe/Bucharest", dateStyle: "short", timeStyle: "short" }) : "permanent"}</td>
                <td>{e.venue_name}<div className="text-xs text-slate-500">{e.locality}</div></td>
                <td className={Number(e.distance_km) > 50 ? "font-bold text-red-700" : ""}>{e.distance_km ?? "?"} km</td>
                <td>{e.geo_status}<div className="text-xs text-slate-500">{e.geo_source}</div></td>
                <td><StatusBadge s={e.status} /></td>
                <td className="text-xs">{e.sources?.join(", ")}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && <p className="p-4 text-slate-500">Niciun rezultat.</p>}
      </div>
    </main>
  );
}
