import { requireAdmin } from "@/lib/auth";
import { getDb } from "@/data/db";
import { adminListErrors, adminListRuns, adminStats } from "@/data/admin";
import { Flash } from "@/components/Flash";
import { resolveErrorAction, toggleSourceAction, triggerIngestionAction } from "../../actions";

type Row = Record<string, unknown>;
const fmt = (v: unknown) => (v ? new Date(String(v)).toLocaleString("ro-RO", { timeZone: "Europe/Bucharest" }) : "—");

export default async function Sources({ searchParams }: { searchParams: Promise<{ ok?: string; err?: string }> }) {
  await requireAdmin(); // layouts and pages render in parallel: every page checks auth itself
  const flash = await searchParams;
  const db = await getDb();
  const [stats, runs, errors] = await Promise.all([adminStats(db), adminListRuns(db, 40), adminListErrors(db, 60)]);
  return (
    <main className="space-y-6">
      <Flash ok={flash.ok} err={flash.err} />
      <section className="card p-4">
        <h2 className="font-bold">Colectare manuală</h2>
        <p className="text-sm text-slate-500">Programat automat la 06:00 și 18:00 (ora României). Rularea manuală poate dura câteva minute (geocodare 1 cerere/secundă).</p>
        <form action={triggerIngestionAction} className="mt-3 flex flex-wrap gap-2">
          <select name="sourceId" className="input max-w-xs">
            <option value="">Toate sursele active</option>
            {stats.bySource.filter((s) => s.adapter !== "manual").map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          <button className="btn-primary">▶ Pornește colectarea</button>
        </form>
      </section>

      <section>
        <h2 className="mb-2 font-bold">Surse</h2>
        <div className="grid gap-3 md:grid-cols-2">
          {stats.bySource.map((s) => (
            <div key={s.id} className="card p-4 text-sm">
              <div className="flex items-center gap-2">
                <strong>{s.name}</strong>
                <span className="badge bg-slate-100">{s.adapter}</span>
                <span className={`badge ${s.enabled ? "bg-emerald-100 text-emerald-800" : "bg-slate-200"}`}>{s.enabled ? "activă" : "oprită"}</span>
                {s.auto_publish && <span className="badge bg-sky-100 text-sky-800">auto-publicare</span>}
              </div>
              <p className="mt-1 text-slate-500">{s.access_notes}</p>
              <p className="mt-1">Evenimente: {s.events} · ultima rulare: {fmt(s.last_run_at)} ({s.last_status ?? "—"})</p>
              <div className="mt-2 flex gap-2">
                <form action={toggleSourceAction}>
                  <input type="hidden" name="id" value={s.id} />
                  <input type="hidden" name="enabled" value={String(!s.enabled)} />
                  <button className="btn-ghost min-h-[36px] text-sm">{s.enabled ? "Oprește" : "Pornește"}</button>
                </form>
                <form action={toggleSourceAction}>
                  <input type="hidden" name="id" value={s.id} />
                  <input type="hidden" name="enabled" value={String(s.enabled)} />
                  <input type="hidden" name="autoPublish" value={String(!s.auto_publish)} />
                  <button className="btn-ghost min-h-[36px] text-sm">{s.auto_publish ? "Doar cu moderare" : "Permite auto-publicare"}</button>
                </form>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2 className="mb-2 font-bold">Rulări recente</h2>
        <div className="card overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="bg-slate-50 text-slate-500"><tr><th className="p-2">Sursă</th><th>Slot</th><th>Status</th><th>Start</th><th>Statistici</th></tr></thead>
            <tbody>
              {(runs as Row[]).map((r) => (
                <tr key={String(r.id)} className="border-t align-top">
                  <td className="p-2">{String(r.source_id)}</td><td>{String(r.slot_key)}</td><td>{String(r.status)}</td><td>{fmt(r.started_at)}</td>
                  <td className="text-xs">{Object.entries((r.stats as Record<string, number>) ?? {}).filter(([, v]) => v).map(([k, v]) => `${k}:${v}`).join(" ")}{r.error ? ` · ${String(r.error)}` : ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section id="erori">
        <h2 className="mb-2 font-bold">Erori de colectare</h2>
        <div className="card divide-y text-sm">
          {(errors as Row[]).length === 0 && <p className="p-3 text-slate-500">Nicio eroare.</p>}
          {(errors as Row[]).map((e) => (
            <div key={String(e.id)} className={`flex flex-wrap items-start gap-2 p-3 ${e.resolved ? "opacity-50" : ""}`}>
              <span className="badge bg-red-100 text-red-800">{String(e.stage)}</span>
              <span className="font-medium">{String(e.source_id ?? "")}</span>
              <span className="flex-1 break-all">{String(e.message)}</span>
              <span className="text-xs text-slate-500">{fmt(e.created_at)}</span>
              {!e.resolved && (
                <form action={resolveErrorAction}><input type="hidden" name="id" value={String(e.id)} /><button className="text-xs text-brand-700 underline">rezolvat</button></form>
              )}
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
