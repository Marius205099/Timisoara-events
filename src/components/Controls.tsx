"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { AGE_GROUPS, CATEGORIES } from "@/lib/taxonomy";
import { DISTANCE_BANDS } from "@/lib/geo";
import { QUICK_DATES, TIME_OF_DAY } from "@/lib/dates";

/**
 * All state lives in the URL, so every view is shareable and works with the
 * back button. Quick dates are plain links (work before JS loads).
 */
export function Controls({ localities, activeQuick, date }: { localities: string[]; activeQuick: string; date?: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const [pending, start] = useTransition();
  const [open, setOpen] = useState(false);

  const get = (k: string) => sp.get(k) ?? "";
  const getList = (k: string) => (sp.get(k) ?? "").split(",").filter(Boolean);
  const push = (mut: (u: URLSearchParams) => void) => {
    const u = new URLSearchParams(sp.toString());
    mut(u);
    start(() => router.replace(`${pathname}${u.toString() ? `?${u}` : ""}`, { scroll: false }));
  };
  const setParam = (k: string, v: string | null) => push((u) => (v ? u.set(k, v) : u.delete(k)));
  const toggleList = (k: string, v: string) =>
    push((u) => {
      const cur = (u.get(k) ?? "").split(",").filter(Boolean);
      const next = cur.includes(v) ? cur.filter((x) => x !== v) : [...cur, v];
      if (next.length) u.set(k, next.join(","));
      else u.delete(k);
    });

  const dateHref = (id: string) => {
    const u = new URLSearchParams(sp.toString());
    u.set("zi", id);
    u.delete("data");
    return `${pathname}?${u}`;
  };

  const ages = getList("varsta");
  const family = get("familie") === "1";
  const extraCount =
    getList("cat").length + getList("ora").length + ["pret", "tip", "loc", "dist", "ff", "acces", "q"].filter((k) => get(k)).length;

  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
  }, [open]);

  return (
    <div className={`space-y-3 transition-opacity ${pending ? "opacity-60" : ""}`} aria-busy={pending}>
      {/* Dates */}
      <nav aria-label="Alege ziua" className="chip-row">
        {QUICK_DATES.map((d) => (
          <Link key={d.id} href={dateHref(d.id)} scroll={false} className={`chip ${activeQuick === d.id ? "chip-on" : ""}`} aria-current={activeQuick === d.id ? "true" : undefined}>
            {d.label}
          </Link>
        ))}
        <label className={`chip relative cursor-pointer ${activeQuick === "data" ? "chip-on" : ""}`}>
          📅 {activeQuick === "data" && date ? date.split("-").reverse().slice(0, 2).join(".") : "Alege data"}
          <input
            type="date"
            aria-label="Alege data"
            className="absolute inset-0 cursor-pointer opacity-0"
            value={date ?? ""}
            onChange={(ev) => ev.target.value && push((u) => { u.set("zi", "data"); u.set("data", ev.target.value); })}
          />
        </label>
      </nav>

      {/* Ages */}
      <div role="group" aria-label="Vârstă" className="chip-row">
        <button type="button" onClick={() => push((u) => { u.delete("varsta"); u.delete("familie"); })} className={`chip ${!ages.length && !family ? "chip-on" : ""}`} aria-pressed={!ages.length && !family}>
          Toate vârstele
        </button>
        <button type="button" onClick={() => setParam("familie", family ? null : "1")} className={`chip ${family ? "chip-on" : ""}`} aria-pressed={family}>
          👨‍👩‍👧 Familie
        </button>
        {AGE_GROUPS.map((a) => (
          <button key={a.id} type="button" onClick={() => toggleList("varsta", a.id)} className={`chip ${ages.includes(a.id) ? "chip-on" : ""}`} aria-pressed={ages.includes(a.id)}>
            {a.label}
          </button>
        ))}
      </div>

      <div className="flex items-center gap-2 px-4">
        <button type="button" onClick={() => setOpen(true)} className="btn-ghost flex-1 sm:flex-none">
          ⚙️ Mai multe filtre{extraCount ? ` (${extraCount})` : ""}
        </button>
        {(extraCount > 0 || ages.length > 0 || family) && (
          <Link href={`${pathname}?zi=${activeQuick}${date ? `&data=${date}` : ""}`} scroll={false} className="btn text-brand-700">
            Resetează
          </Link>
        )}
      </div>

      {open && (
        <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/40 sm:items-center" onClick={() => setOpen(false)}>
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Filtre"
            className="max-h-[85dvh] w-full overflow-y-auto rounded-t-3xl bg-white p-5 pb-[calc(1.25rem+var(--safe-bottom))] sm:max-w-lg sm:rounded-3xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-bold">Filtre</h2>
              <button type="button" className="btn-ghost" onClick={() => setOpen(false)}>Gata</button>
            </div>

            <Section title="Caută">
              <input
                className="input"
                type="search"
                placeholder="Titlu, loc, organizator…"
                defaultValue={get("q")}
                onKeyDown={(e) => e.key === "Enter" && setParam("q", (e.target as HTMLInputElement).value.trim() || null)}
                onBlur={(e) => e.target.value.trim() !== get("q") && setParam("q", e.target.value.trim() || null)}
              />
            </Section>

            <Section title="Categorie">
              <div className="flex flex-wrap gap-2">
                {CATEGORIES.map((c) => (
                  <button key={c.id} type="button" onClick={() => toggleList("cat", c.id)} className={`chip ${getList("cat").includes(c.id) ? "chip-on" : ""}`} aria-pressed={getList("cat").includes(c.id)}>
                    {c.emoji} {c.label}
                  </button>
                ))}
              </div>
            </Section>

            <Section title="Preț">
              <Seg options={[["", "Oricare"], ["gratuit", "Gratuit"], ["platit", "Cu plată"]]} value={get("pret")} onChange={(v) => setParam("pret", v || null)} />
            </Section>

            <Section title="Unde">
              <Seg options={[["", "Oricare"], ["interior", "Interior"], ["exterior", "Exterior"]]} value={get("tip")} onChange={(v) => setParam("tip", v || null)} />
            </Section>

            <Section title="Momentul zilei">
              <div className="flex flex-wrap gap-2">
                {TIME_OF_DAY.map((t) => (
                  <button key={t.id} type="button" onClick={() => toggleList("ora", t.id)} className={`chip ${getList("ora").includes(t.id) ? "chip-on" : ""}`} aria-pressed={getList("ora").includes(t.id)}>
                    {t.label}
                  </button>
                ))}
              </div>
            </Section>

            <Section title="Distanța față de centrul Timișoarei">
              <Seg options={[["", "0–50 km"], ...DISTANCE_BANDS.map((b) => [b.id, b.label] as [string, string])]} value={get("dist")} onChange={(v) => setParam("dist", v || null)} />
            </Section>

            <Section title="Localitate">
              <select className="input" value={get("loc")} onChange={(e) => setParam("loc", e.target.value || null)}>
                <option value="">Toate localitățile</option>
                {localities.map((l) => (
                  <option key={l} value={l}>{l}</option>
                ))}
              </select>
            </Section>

            <Section title="Altele">
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={() => setParam("ff", get("ff") ? null : "1")} className={`chip ${get("ff") ? "chip-on" : ""}`} aria-pressed={!!get("ff")}>
                  Potrivit pentru familii
                </button>
                <button type="button" onClick={() => setParam("acces", get("acces") ? null : "1")} className={`chip ${get("acces") ? "chip-on" : ""}`} aria-pressed={!!get("acces")}>
                  ♿ Accesibilitate confirmată
                </button>
              </div>
            </Section>
          </div>
        </div>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-5">
      <h3 className="label">{title}</h3>
      {children}
    </section>
  );
}

function Seg({ options, value, onChange }: { options: [string, string][]; value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map(([v, l]) => (
        <button key={v} type="button" onClick={() => onChange(v)} className={`chip ${value === v ? "chip-on" : ""}`} aria-pressed={value === v}>
          {l}
        </button>
      ))}
    </div>
  );
}
