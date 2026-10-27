import { requireAdmin } from "@/lib/auth";
import Link from "next/link";
import { getDb } from "@/data/db";
import { adminListEvents, adminStats } from "@/data/admin";
import { REASON_LABEL } from "@/components/Flash";
import { isEmbeddedMode } from "@/lib/config";

export default async function Dashboard() {
  await requireAdmin(); // layouts and pages render in parallel: every page checks auth itself
  const db = await getDb();
  const [stats, review] = await Promise.all([adminStats(db), adminListEvents(db, { status: "needs_review", limit: 10 })]);
  const c = stats.counts;
  const tiles: [string, number, string][] = [
    ["Publicate", c.published, "/admin/evenimente?status=published"],
    ["De verificat", c.needs_review, "/admin/evenimente?status=needs_review"],
    ["Respinse", c.rejected, "/admin/evenimente?status=rejected"],
    ["  din care >50 km", c.out_of_radius, "/admin/evenimente?status=rejected"],
    ["Anulate", c.canceled, "/admin/evenimente?status=canceled"],
    ["Trimiteri noi", stats.pendingSubmissions, "/admin/trimiteri"],
    ["Erori deschise", stats.openErrors, "/admin/surse#erori"],
  ];
  return (
    <main>
      {isEmbeddedMode() && (
        <p className="mb-4 rounded-xl bg-amber-50 p-3 text-sm text-amber-900">Mod local: bază de date încorporată (nu producție).</p>
      )}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
        {tiles.map(([label, n, href]) => (
          <Link key={label} href={href} className="card p-4 hover:border-brand-500">
            <div className="text-3xl font-extrabold">{n}</div>
            <div className="text-sm text-slate-500">{label.trim()}</div>
          </Link>
        ))}
      </div>

      <h2 className="mb-2 mt-8 text-lg font-bold">De verificat</h2>
      <div className="card divide-y">
        {review.length === 0 && <p className="p-4 text-slate-500">Nimic de verificat. 🎉</p>}
        {review.map((e) => (
          <Link key={e.id} href={`/admin/evenimente/${e.id}`} className="flex flex-wrap items-center gap-2 p-3 hover:bg-slate-50">
            <span className="font-semibold">{e.title}</span>
            <span className="text-sm text-slate-500">{e.venue_name} · {e.locality} · {e.distance_km ?? "?"} km</span>
            <span className="badge ml-auto bg-amber-100 text-amber-900">{REASON_LABEL[e.review_reason ?? ""] ?? e.review_reason}</span>
          </Link>
        ))}
      </div>

      <h2 className="mb-2 mt-8 text-lg font-bold">Surse</h2>
      <div className="card overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-slate-500"><tr><th className="p-3">Sursă</th><th>Evenimente</th><th>Ultima rulare</th><th>Status</th></tr></thead>
          <tbody>
            {stats.bySource.map((s) => (
              <tr key={s.id} className="border-t">
                <td className="p-3 font-medium">{s.name}{!s.enabled && " (oprită)"}</td>
                <td>{s.events}</td>
                <td>{s.last_run_at ? new Date(s.last_run_at).toLocaleString("ro-RO", { timeZone: "Europe/Bucharest" }) : "—"}</td>
                <td>{s.last_status ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}
