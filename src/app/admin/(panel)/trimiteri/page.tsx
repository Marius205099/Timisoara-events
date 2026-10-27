import { requireAdmin } from "@/lib/auth";
import { getDb } from "@/data/db";
import { adminListSubmissions } from "@/data/admin";
import { submissionAction } from "../../actions";

type Row = Record<string, unknown>;

export default async function Submissions({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  await requireAdmin(); // layouts and pages render in parallel: every page checks auth itself
  const { status = "pending" } = await searchParams;
  const rows = (await adminListSubmissions(await getDb(), status)) as Row[];
  return (
    <main>
      <div className="mb-3 flex gap-2 text-sm">
        {["pending", "approved", "rejected"].map((s) => (
          <a key={s} href={`/admin/trimiteri?status=${s}`} className={`chip min-h-[36px] ${s === status ? "chip-on" : ""}`}>{s}</a>
        ))}
      </div>
      <div className="grid gap-3">
        {rows.length === 0 && <p className="text-slate-500">Nicio trimitere.</p>}
        {rows.map((s) => (
          <div key={String(s.id)} className="card p-4 text-sm">
            <h3 className="text-base font-bold">{String(s.title)}</h3>
            <p>{new Date(String(s.starts_at)).toLocaleString("ro-RO", { timeZone: "Europe/Bucharest" })} · {String(s.venue_name)}, {String(s.venue_address)}, {String(s.locality)}</p>
            <p className="mt-1">Pre-verificare locație: <strong>{String(s.geo_verdict ?? "—")}</strong> · {s.distance_km != null ? `${String(s.distance_km)} km` : "distanță necunoscută"}</p>
            <p className="mt-1 text-slate-500">Organizator: {String(s.organizer_name ?? "—")} · contact: {String(s.contact_email)} · {s.source_url ? <a className="text-brand-700 underline" href={String(s.source_url)} target="_blank" rel="noopener nofollow">sursă ↗</a> : "fără link"}</p>
            {s.description ? <p className="mt-2 whitespace-pre-line">{String(s.description).slice(0, 600)}</p> : null}
            {status === "pending" && (
              <div className="mt-3 flex gap-2">
                <form action={submissionAction}><input type="hidden" name="id" value={String(s.id)} /><input type="hidden" name="decision" value="approve" /><button className="btn-primary">Aprobă (creează eveniment)</button></form>
                <form action={submissionAction}><input type="hidden" name="id" value={String(s.id)} /><input type="hidden" name="decision" value="reject" /><button className="btn-ghost">Respinge</button></form>
              </div>
            )}
          </div>
        ))}
      </div>
    </main>
  );
}
