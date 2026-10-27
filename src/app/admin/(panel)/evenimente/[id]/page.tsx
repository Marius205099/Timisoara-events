import { requireAdmin } from "@/lib/auth";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getDb } from "@/data/db";
import { adminGetEvent } from "@/data/admin";
import { Flash, REASON_LABEL, StatusBadge } from "@/components/Flash";
import { relocateVenueAction, setStatusAction, updateEventAction } from "../../../actions";
import { AGE_GROUPS, CATEGORIES } from "@/lib/taxonomy";
import { formatSessionRo } from "@/lib/dates";
import { osmEmbedUrl } from "@/lib/geo";

type Row = Record<string, unknown>;
const s = (v: unknown) => (v == null ? "" : String(v));

export default async function AdminEvent({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ ok?: string; err?: string }> }) {
  await requireAdmin(); // layouts and pages render in parallel: every page checks auth itself
  const { id } = await params;
  const flash = await searchParams;
  const data = await adminGetEvent(await getDb(), id);
  if (!data) notFound();
  const e = data.event as Row;
  const lat = e.lat as number | null;
  const lng = e.lng as number | null;
  const back = `/admin/evenimente/${id}`;

  return (
    <main className="grid gap-4 lg:grid-cols-[1fr_380px]">
      <div className="space-y-4">
        <Flash ok={flash.ok} err={flash.err} />
        <div className="card p-4">
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge s={s(e.status)} />
            {Boolean(e.is_demo) && <span className="badge bg-amber-300">DEMO</span>}
            {Boolean(e.admin_locked) && <span className="badge bg-slate-200">editat manual</span>}
            {e.review_reason ? <span className="text-sm text-amber-800">{REASON_LABEL[s(e.review_reason)] ?? s(e.review_reason)}</span> : null}
          </div>
          <h1 className="mt-2 text-xl font-extrabold">{s(e.title)}</h1>
          <p className="text-sm text-slate-500">/{s(e.slug)} · {s(e.kind)}</p>
          {e.status === "published" && <Link href={`/eveniment/${s(e.slug)}`} className="text-sm text-brand-700 underline">Vezi pagina publică ↗</Link>}

          <div className="mt-4 flex flex-wrap gap-2">
            {[
              ["published", "✅ Publică", "btn-primary"],
              ["needs_review", "↩︎ De verificat", "btn-ghost"],
              ["canceled", "🚫 Marchează anulat", "btn-ghost"],
              ["rejected", "✖ Respinge", "btn-ghost"],
              ["archived", "🗄 Arhivează / elimină", "btn-ghost"],
            ].map(([st, label, cls]) => (
              <form key={st} action={setStatusAction}>
                <input type="hidden" name="id" value={id} />
                <input type="hidden" name="status" value={st} />
                <input type="hidden" name="back" value={back} />
                <button className={cls} disabled={e.status === st}>{label}</button>
              </form>
            ))}
          </div>
          <p className="mt-2 text-xs text-slate-500">Publicarea este blocată de baza de date dacă locația nu este verificată în raza de 50 km.</p>
        </div>

        <form action={updateEventAction} className="card space-y-3 p-4">
          <h2 className="font-bold">Editare</h2>
          <input type="hidden" name="id" value={id} />
          <L label="Titlu"><input name="title" defaultValue={s(e.title)} className="input" /></L>
          <L label="Rezumat (original, RO)"><textarea name="summary" defaultValue={s(e.summary)} rows={3} className="input py-2" /></L>
          <L label="Descriere sursă"><textarea name="description" defaultValue={s(e.description)} rows={5} className="input py-2" /></L>
          <div className="grid grid-cols-2 gap-3">
            <L label="Vârstă minimă OFICIALĂ"><input name="officialMinAge" type="number" defaultValue={s(e.official_min_age)} className="input" /></L>
            <L label="Vârstă maximă OFICIALĂ"><input name="officialMaxAge" type="number" defaultValue={s(e.official_max_age)} className="input" /></L>
          </div>
          <fieldset>
            <legend className="label">Grupe de vârstă recomandate</legend>
            <div className="flex flex-wrap gap-3">
              {AGE_GROUPS.map((a) => (
                <label key={a.id} className="flex items-center gap-1 text-sm"><input type="checkbox" name="ageGroups" value={a.id} defaultChecked={data.ageGroups.includes(a.id)} /> {a.label}</label>
              ))}
              <label className="flex items-center gap-1 text-sm"><input type="checkbox" name="allAges" defaultChecked={Boolean(e.all_ages)} /> Toate vârstele</label>
              <label className="flex items-center gap-1 text-sm"><input type="checkbox" name="familyFriendly" defaultChecked={Boolean(e.family_friendly)} /> Familie</label>
            </div>
          </fieldset>
          <fieldset>
            <legend className="label">Categorii</legend>
            <div className="flex flex-wrap gap-3">
              {CATEGORIES.map((c) => (
                <label key={c.id} className="flex items-center gap-1 text-sm"><input type="checkbox" name="categories" value={c.id} defaultChecked={data.categories.includes(c.id)} /> {c.label}</label>
              ))}
            </div>
          </fieldset>
          <div className="grid grid-cols-3 gap-3">
            <L label="Gratuit?">
              <select name="isFree" defaultValue={e.is_free === true ? "yes" : e.is_free === false ? "no" : ""} className="input">
                <option value="">Necunoscut</option><option value="yes">Da</option><option value="no">Nu</option>
              </select>
            </L>
            <L label="Preț min"><input name="priceMin" type="number" step="0.01" defaultValue={s(e.price_min)} className="input" /></L>
            <L label="Preț max"><input name="priceMax" type="number" step="0.01" defaultValue={s(e.price_max)} className="input" /></L>
          </div>
          <L label="Link bilete"><input name="ticketUrl" type="url" defaultValue={s(e.ticket_url)} className="input" /></L>
          <L label="Interior / exterior">
            <select name="indoorOutdoor" defaultValue={s(e.indoor_outdoor)} className="input">
              <option value="unknown">Necunoscut</option><option value="indoor">Interior</option><option value="outdoor">Exterior</option><option value="mixed">Mixt</option>
            </select>
          </L>
          <L label="Accesibilitate (doar informații confirmate)"><input name="accessibility" defaultValue={s(e.accessibility)} className="input" /></L>
          <L label="Avertisment / incertitudine (public)"><input name="uncertaintyNote" defaultValue={s(e.uncertainty_note)} className="input" /></L>
          <button className="btn-primary">Salvează</button>
          <p className="text-xs text-slate-500">După editare, colectarea automată nu mai suprascrie textele și clasificarea.</p>
        </form>
      </div>

      <aside className="space-y-4">
        <div className="card p-4 text-sm">
          <h2 className="mb-2 font-bold">Locație</h2>
          <p className="font-semibold">{s(e.venue_name)}</p>
          <p>{s(e.venue_address)}{e.locality ? `, ${s(e.locality)}` : ""}</p>
          <p className="mt-2">
            Distanță: <strong className={Number(e.distance_km) > 50 ? "text-red-700" : ""}>{s(e.distance_km) || "?"} km</strong> · {s(e.geo_status)}
            <br />Sursă geo: {s(e.geo_source) || "—"} · încredere {s(e.geo_confidence) || "—"} · ±{s(e.geo_uncertainty_m) || "?"} m
            <br />Coordonate: {lat != null ? `${lat.toFixed(6)}, ${lng!.toFixed(6)}` : "necunoscute"}
          </p>
          {e.organizer_name ? <p className="mt-2 text-slate-500">Organizator: {s(e.organizer_name)} {e.organizer_address ? `(${s(e.organizer_address)} — nu se folosește pentru locație)` : ""}</p> : null}
          {lat != null && <iframe title="Hartă" src={osmEmbedUrl({ lat, lng: lng! })} className="mt-3 h-48 w-full rounded-lg border-0" loading="lazy" />}
          {e.venue_id ? (
            <form action={relocateVenueAction} className="mt-3 space-y-2">
              <input type="hidden" name="venueId" value={s(e.venue_id)} />
              <input type="hidden" name="eventId" value={id} />
              <p className="font-semibold">Corectează coordonatele locului</p>
              <div className="grid grid-cols-2 gap-2">
                <input name="lat" placeholder="lat (45.75…)" defaultValue={lat ?? ""} className="input" inputMode="decimal" required />
                <input name="lng" placeholder="lng (21.22…)" defaultValue={lng ?? ""} className="input" inputMode="decimal" required />
              </div>
              <button className="btn-ghost w-full">Verifică & salvează locația</button>
              <p className="text-xs text-slate-500">Distanța se recalculează în baza de date; toate evenimentele din acest loc sunt revalidate.</p>
            </form>
          ) : null}
        </div>

        <div className="card p-4 text-sm">
          <h2 className="mb-2 font-bold">Date</h2>
          <ul className="space-y-1">
            {(data.sessions as Row[]).map((x) => (
              <li key={s(x.id)}>{formatSessionRo(new Date(s(x.starts_at)).toISOString(), x.ends_at ? new Date(s(x.ends_at)).toISOString() : null)} · {s(x.status)}</li>
            ))}
          </ul>
        </div>

        <div className="card p-4 text-sm">
          <h2 className="mb-2 font-bold">Surse</h2>
          {(data.sources as Row[]).map((x) => (
            <details key={s(x.id)} className="mb-2">
              <summary className="cursor-pointer">{s(x.source_name)} · <a href={s(x.url)} target="_blank" rel="noopener" className="text-brand-700 underline">link ↗</a></summary>
              <pre className="mt-1 max-h-64 overflow-auto rounded bg-slate-50 p-2 text-xs">{JSON.stringify(x.raw, null, 1)}</pre>
            </details>
          ))}
          <p className="mt-2 text-xs text-slate-500">AI: încredere {s(e.ai_confidence) || "—"}</p>
          <pre className="max-h-40 overflow-auto rounded bg-slate-50 p-2 text-xs">{JSON.stringify(e.ai_evidence, null, 1)}</pre>
        </div>

        <div className="card p-4 text-sm">
          <h2 className="mb-2 font-bold">Istoric</h2>
          <ul className="space-y-1">
            {(data.reviews as Row[]).map((r) => (
              <li key={s(r.id)}><span className="text-slate-500">{new Date(s(r.created_at)).toLocaleString("ro-RO", { timeZone: "Europe/Bucharest" })}</span> · {s(r.action)} {r.reason ? `— ${s(r.reason)}` : ""}</li>
            ))}
          </ul>
        </div>
      </aside>
    </main>
  );
}

function L({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="label">{label}</span>
      {children}
    </label>
  );
}
