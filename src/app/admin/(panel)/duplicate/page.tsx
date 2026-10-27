import { requireAdmin } from "@/lib/auth";
import Link from "next/link";
import { getDb } from "@/data/db";
import { adminDuplicateSuggestions } from "@/data/admin";
import { Flash } from "@/components/Flash";
import { mergeAction } from "../../actions";

export default async function Duplicates({ searchParams }: { searchParams: Promise<{ ok?: string }> }) {
  await requireAdmin(); // layouts and pages render in parallel: every page checks auth itself
  const { ok } = await searchParams;
  const pairs = await adminDuplicateSuggestions(await getDb());
  return (
    <main>
      <Flash ok={ok} />
      <p className="mb-3 text-sm text-slate-500">Evenimente în același loc (±250 m) la ±45 de minute. Duplicatele evidente sunt consolidate automat la colectare.</p>
      <div className="grid gap-3">
        {pairs.length === 0 && <p className="text-slate-500">Nicio suspiciune de duplicat.</p>}
        {pairs.map((p) => (
          <div key={p.a_id + p.b_id} className="card flex flex-wrap items-center gap-3 p-4 text-sm">
            <div className="flex-1">
              <Link href={`/admin/evenimente/${p.a_id}`} className="font-semibold text-brand-700">{p.a_title}</Link>
              <div className="text-slate-400">vs.</div>
              <Link href={`/admin/evenimente/${p.b_id}`} className="font-semibold text-brand-700">{p.b_title}</Link>
              <div className="text-slate-500">{p.venue} · {new Date(p.starts_at).toLocaleString("ro-RO", { timeZone: "Europe/Bucharest" })}</div>
            </div>
            <form action={mergeAction}><input type="hidden" name="keep" value={p.a_id} /><input type="hidden" name="drop" value={p.b_id} /><button className="btn-ghost">Păstrează primul</button></form>
            <form action={mergeAction}><input type="hidden" name="keep" value={p.b_id} /><input type="hidden" name="drop" value={p.a_id} /><button className="btn-ghost">Păstrează al doilea</button></form>
          </div>
        ))}
      </div>
    </main>
  );
}
