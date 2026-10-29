(() => {
  "use strict";
  const DATA = window.CF_DATA;
  const MAX_KM = 50;
  const TZ = "Europe/Bucharest";

  const AGES = [
    ["0-2", "0–2 ani", 0, 2], ["3-7", "3–7 ani", 3, 7], ["8-12", "8–12 ani", 8, 12],
    ["13-17", "13–17 ani", 13, 17], ["18-64", "18–64 ani", 18, 64], ["65+", "65+ ani", 65, 120],
  ];
  const CATS = {
    concerte: "Concerte", festivaluri: "Festivaluri", teatru: "Teatru", cinema: "Cinema", expozitii: "Expoziții", muzee: "Muzee",
    "auto-clasic": "Mașini clasice", sport: "Sport", "aer-liber": "Aer liber", ateliere: "Ateliere", gastronomie: "Gastronomie",
    cultural: "Cultural", "viata-de-noapte": "Viață de noapte", familie: "Familie", seniori: "Seniori", comunitate: "Comunitate",
    targuri: "Târguri", tururi: "Tururi ghidate", sezoniere: "Sezoniere",
  };
  const DAYS = ["duminică", "luni", "marți", "miercuri", "joi", "vineri", "sâmbătă"];
  const DAYS_SHORT = ["dum", "lun", "mar", "mie", "joi", "vin", "sâm"];
  const MONTHS = ["ianuarie", "februarie", "martie", "aprilie", "mai", "iunie", "iulie", "august", "septembrie", "octombrie", "noiembrie", "decembrie"];

  // Only verified venues within 50 km ever reach the page; this re-check keeps it that way.
  const EVENTS = DATA.events.filter((e) => e.v && typeof e.v.km === "number" && e.v.km <= MAX_KM);
  // Places to visit any day (museums, karting, climbing, parks…), same 50 km rule.
  const PLACES = (DATA.places || []).filter((p) => typeof p.km === "number" && p.km <= MAX_KM);
  const PCATS = DATA.pcats || {};

  // ---------- Calendar math on Bucharest dates (YYYY-MM-DD strings; DST cannot shift a calendar day) ----------
  const todayBucharest = () => new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  const toUTC = (d) => { const [y, m, dd] = d.split("-").map(Number); return new Date(Date.UTC(y, m - 1, dd)); };
  const fromUTC = (x) => x.toISOString().slice(0, 10);
  const addDays = (d, n) => { const x = toUTC(d); x.setUTCDate(x.getUTCDate() + n); return fromUTC(x); };
  const weekday = (d) => toUTC(d).getUTCDay(); // 0 = Sunday
  const nextWeekday = (d, wd) => addDays(d, (wd - weekday(d) + 7) % 7);
  const human = (d) => { const x = toUTC(d); return `${DAYS[x.getUTCDay()]}, ${x.getUTCDate()} ${MONTHS[x.getUTCMonth()]}`; };
  const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
  const fold = (s) => String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  // A summary that only repeats the title (plus a few words of boilerplate) adds nothing.
  const usefulSummary = (e) => (e.sum && fold(e.sum).replace(fold(e.title), "").trim().length >= 40 ? e.sum : "");

  // @day-chips-start
  /**
   * Quick-date chips in calendar order, without repeats: Azi, Mâine, then each following day by
   * name up to the first Sunday after tomorrow. Thursday → Azi, Mâine, Sâmbătă, Duminică;
   * Monday → Azi, Mâine, Miercuri … Duminică; Saturday → Azi, Mâine; Sunday → Azi, Mâine, Marți … Duminică.
   */
  function dayChips(t) {
    const out = [["azi", "Azi", t], ["maine", "Mâine", addDays(t, 1)]];
    const lastSunday = nextWeekday(addDays(t, 1), 0);
    for (let d = addDays(t, 2); d <= lastSunday; d = addDays(d, 1)) out.push(["zi", cap(DAYS[weekday(d)]), d]);
    return out;
  }
  // @day-chips-end

  function range(q, custom) {
    const t = todayBucharest();
    switch (q) {
      case "azi": return { days: [t], label: `Azi, ${human(t)}` };
      case "maine": return { days: [addDays(t, 1)], label: `Mâine, ${human(addDays(t, 1))}` };
      case "zi":
      case "data": { const d = custom || t; return { days: [d], label: cap(human(d)) }; }
      default: return { days: Array.from({ length: 7 }, (_, i) => addDays(t, i)), label: "Următoarele 7 zile" };
    }
  }

  // ---------- Age rules (same as the server: official restrictions are hard limits) ----------
  const group = (id) => AGES.find((a) => a[0] === id);
  const allowsGroup = (e, id) => { const g = group(id); return g[3] >= (e.min ?? 0) && g[2] <= (e.max ?? 200); };
  function ageMatch(e, sel, family) {
    if (!sel.length) return family ? (e.all || e.fam) && (e.min ?? 0) < 18 : true;
    if (family) {
      if (!sel.every((id) => allowsGroup(e, id))) return false;
      return e.all || e.fam || sel.every((id) => e.ag.includes(id));
    }
    return sel.some((id) => allowsGroup(e, id) && (e.all || e.ag.includes(id)));
  }

  // ---------- State ----------
  const S = { view: "events", pcat: "", q: "7zile", date: "", ages: [], family: false, cats: [], price: "", io: "", tod: [], dist: "", loc: "" };
  try { Object.assign(S, JSON.parse(localStorage.getItem("cf-filters") || "{}"), { q: "7zile", date: "" }); } catch (_) { /* storage unavailable */ }
  const save = () => { try { localStorage.setItem("cf-filters", JSON.stringify({ ages: S.ages, family: S.family })); } catch (_) {} };

  const tod = (h) => (h >= 5 && h < 12 ? "morning" : h >= 12 && h < 18 ? "afternoon" : "evening");
  const band = (km) => (km <= 10 ? "0-10" : km <= 25 ? "10-25" : "25-50");

  function filtered() {
    const r = range(S.q, S.date);
    const set = new Set(r.days);
    const now = new Date();
    const nowDay = todayBucharest();
    const nowHM = new Intl.DateTimeFormat("en-GB", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(now);
    const items = [];
    for (const e of EVENTS) {
      let hit = null;
      if (!e.k) {
        hit = e.s.find((s) => set.has(s.d) && !(s.d === nowDay && (s.e || s.t || "23:59") < nowHM && s.t) && (!S.tod.length || s.t === null || S.tod.includes(tod(s.h))));
        if (!hit) continue;
      }
      if (!ageMatch(e, S.ages, S.family)) continue;
      if (S.cats.length && !e.cat.some((c) => S.cats.includes(c))) continue;
      if (S.price === "free" && e.free !== true) continue;
      if (S.price === "paid" && e.free !== false) continue;
      if (S.io && e.io !== S.io && e.io !== "mixed") continue;
      if (S.dist && band(e.v.km) !== S.dist) continue;
      if (S.loc && e.v.l !== S.loc) continue;
      items.push({ e, s: hit });
    }
    items.sort((a, b) => (a.e.k - b.e.k) || (a.e.c - b.e.c) || (a.s && b.s ? (a.s.d + (a.s.t || "")).localeCompare(b.s.d + (b.s.t || "")) : 0));
    return { r, items };
  }

  // ---------- Rendering ----------
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const km = (k) => (k < 1 ? `${Math.round(k * 1000)} m` : `${String(k).replace(".", ",")} km`);
  const price = (e) => (e.free ? "Gratuit" : e.pmin != null ? (e.pmax && e.pmax !== e.pmin ? `${Math.round(e.pmin)}–${Math.round(e.pmax)} ${e.cur || "RON"}` : `de la ${Math.round(e.pmin)} ${e.cur || "RON"}`) : "");
  const ageLabel = (e) => {
    if ((e.min ?? 0) >= 18) return ["Doar 18+", "age18"];
    if (e.all) return ["Toate vârstele", ""];
    if (e.min) return [`${e.min}+ (oficial)`, ""];
    const g = e.ag.map((id) => group(id)[1]).join(", ");
    return [g || "Vârstă nespecificată", ""];
  };

  function chip(label, pressed, onClick, cls = "") {
    const b = document.createElement("button");
    b.type = "button";
    b.className = `chip ${cls}`;
    b.textContent = label;
    b.setAttribute("aria-pressed", String(pressed));
    b.addEventListener("click", onClick);
    return b;
  }

  function renderBar() {
    const places = S.view === "places";
    $("tab-events").setAttribute("aria-selected", String(!places));
    $("tab-places").setAttribute("aria-selected", String(places));
    $("dates").hidden = places;
    $("pcats").hidden = !places;
    $("more").hidden = places;
    if (places) {
      $("pcats").replaceChildren(
        chip("Toate", !S.pcat, () => { S.pcat = ""; render(); }),
        ...Object.entries(PCATS).filter(([id]) => PLACES.some((p) => p.cat === id)).map(([id, l]) => chip(l, S.pcat === id, () => { S.pcat = S.pcat === id ? "" : id; render(); })),
      );
    }
    const dates = $("dates");
    dates.replaceChildren(
      ...dayChips(todayBucharest()).map(([id, l, d]) => {
        const on = id === "zi" ? S.q === "zi" && S.date === d : S.q === id;
        return chip(l, on, () => { if (on) { S.q = "7zile"; S.date = ""; } else { S.q = id; S.date = id === "zi" ? d : ""; } render(); });
      }),
    );
    const pick = chip(S.q === "data" && S.date ? S.date.split("-").reverse().slice(0, 2).join(".") : "Alege data", S.q === "data", () => {});
    const input = document.createElement("input");
    input.type = "date"; input.id = "pick-date"; input.setAttribute("aria-label", "Alege data"); input.min = todayBucharest(); input.value = S.date;
    input.addEventListener("change", () => { if (input.value) { S.q = "data"; S.date = input.value; render(); } });
    pick.appendChild(input);
    dates.appendChild(pick);

    const ages = $("ages");
    ages.replaceChildren(
      chip("Toate vârstele", !S.ages.length && !S.family, () => { S.ages = []; S.family = false; save(); render(); }),
      chip("Familie", S.family, () => { S.family = !S.family; save(); render(); }, "fam"),
      ...AGES.map(([id, l]) => chip(l, S.ages.includes(id), () => { S.ages = S.ages.includes(id) ? S.ages.filter((x) => x !== id) : [...S.ages, id]; save(); render(); })),
    );

    const extra = S.cats.length + S.tod.length + [S.price, S.io, S.dist, S.loc].filter(Boolean).length;
    $("more").textContent = extra ? `Mai multe filtre (${extra})` : "Mai multe filtre";
    $("reset").hidden = places ? !(S.pcat || S.ages.length || S.family) : !(extra || S.ages.length || S.family);
    if (!$("panel").hidden) renderPanel();
  }

  function renderPanel() {
    const p = $("panel-body");
    const sec = (title, nodes) => { const d = document.createElement("div"); const h = document.createElement("h3"); h.textContent = title; const r = document.createElement("div"); r.className = "row"; r.append(...nodes); d.append(h, r); return d; };
    const toggle = (arr, v) => (arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);
    const one = (key, opts) => opts.map(([v, l]) => chip(l, S[key] === v, () => { S[key] = v; render(); }));
    const usedCats = [...new Set(EVENTS.flatMap((e) => e.cat))].filter((c) => CATS[c]);
    const locs = [...new Set(EVENTS.map((e) => e.v.l))].sort((a, b) => a.localeCompare(b, "ro"));
    const sel = document.createElement("select");
    sel.id = "loc"; sel.setAttribute("aria-label", "Localitate");
    sel.append(new Option("Toate localitățile", ""), ...locs.map((l) => new Option(l, l)));
    sel.value = S.loc;
    sel.addEventListener("change", () => { S.loc = sel.value; render(); });
    p.replaceChildren(
      sec("Categorie", usedCats.map((c) => chip(CATS[c], S.cats.includes(c), () => { S.cats = toggle(S.cats, c); render(); }))),
      sec("Preț", one("price", [["", "Oricare"], ["free", "Gratuit"], ["paid", "Cu plată"]])),
      sec("Momentul zilei", [["morning", "Dimineața"], ["afternoon", "După-amiaza"], ["evening", "Seara"]].map(([v, l]) => chip(l, S.tod.includes(v), () => { S.tod = toggle(S.tod, v); render(); }))),
      sec("Unde", one("io", [["", "Oricare"], ["indoor", "Interior"], ["outdoor", "Exterior"]])),
      sec("Distanța de centru", one("dist", [["", "0–50 km"], ["0-10", "0–10 km"], ["10-25", "10–25 km"], ["25-50", "25–50 km"]])),
      sec("Localitate", [sel]),
    );
  }

  function card({ e, s }) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = `card${e.c || (s && s.x) ? " cx" : ""}`;
    const d = s ? toUTC(s.d) : null;
    const [al, ac] = ageLabel(e);
    const pr = price(e);
    b.innerHTML = `
      <div class="when" aria-hidden="true">${d ? `<span>${DAYS_SHORT[d.getUTCDay()]}</span><b>${d.getUTCDate()}</b><span>${s.t || "toată ziua"}</span>` : "<span>oricând</span>"}</div>
      <div>
        ${e.c || (s && s.x) ? '<span class="tag x">ANULAT</span> ' : ""}
        <h4>${esc(e.title)}</h4>
        <p class="meta">${s ? `${esc(cap(human(s.d)))}${s.t ? `, ${s.t}${s.e ? "–" + s.e : ""}` : ""} · ` : ""}${esc(e.v.n)}${e.v.l && e.v.l !== "Timișoara" ? ", " + esc(e.v.l) : ""} · ${km(e.v.km)}</p>
        <div class="tags">
          ${e.cat[0] ? `<span class="tag">${esc(CATS[e.cat[0]] || e.cat[0])}</span>` : ""}
          <span class="tag ${ac}">${esc(al)}</span>
          ${pr ? `<span class="tag ${e.free ? "free" : ""}">${esc(pr)}</span>` : ""}
        </div>
        <p class="src">Sursa: ${esc(e.src.map((x) => x.n).join(", "))}</p>
      </div>`;
    b.addEventListener("click", () => openDetail(e.id, true));
    return b;
  }

  function renderList() {
    const { r, items } = filtered();
    const scheduled = items.filter((x) => !x.e.k);
    const n = `${scheduled.length} ${scheduled.length === 1 ? "eveniment" : "evenimente"}`;
    $("count").innerHTML = `${esc(r.label)} <small>· ${n}</small>`;
    $("panel-ok").textContent = `OK · arată ${n}`;
    const list = $("list");
    list.replaceChildren();
    if (!scheduled.length) {
      const d = document.createElement("div");
      d.className = "empty";
      d.innerHTML = "<strong>Niciun eveniment pentru aceste filtre.</strong>Încercați altă zi sau o altă grupă de vârstă. Evenimentele pentru copii și din localitățile din jur sunt încă puține, lucrăm la surse noi.";
      list.appendChild(d);
    }
    let lastDay = null;
    let grid = null;
    for (const it of scheduled) {
      if (r.days.length > 1 && it.s.d !== lastDay) {
        const h = document.createElement("h3"); h.className = "day"; h.textContent = human(it.s.d); list.appendChild(h);
        grid = null; lastDay = it.s.d;
      }
      if (!grid) { grid = document.createElement("div"); grid.className = "grid"; list.appendChild(grid); }
      grid.appendChild(card(it));
    }
  }

  // ---------- Places (any day) ----------
  const IO = { indoor: "Interior", outdoor: "Exterior", mixed: "Interior și exterior" };
  function placeAgeMatch(p) {
    const kids = ["0-2", "3-7", "8-12", "13-17"];
    if (S.family && !p.ag.some((a) => kids.includes(a))) return false;
    return !S.ages.length || S.ages.some((a) => p.ag.includes(a));
  }
  const placeAges = (p) => (p.ag.length === AGES.length ? "Toate vârstele" : p.ag.map((id) => group(id)[1]).join(", "));
  const filteredPlaces = () => PLACES.filter((p) => (!S.pcat || p.cat === S.pcat) && placeAgeMatch(p));

  function placeCard(p) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "card place";
    b.innerHTML = `
      <div class="when" aria-hidden="true"><span>${p.km < 1 ? "sub" : "la"}</span><b>${p.km < 1 ? "1" : Math.round(p.km)}</b><span>km</span></div>
      <div>
        <h4>${esc(p.n)}</h4>
        <p class="meta">${esc(p.d)}</p>
        <div class="tags">
          <span class="tag">${esc(PCATS[p.cat] || p.cat)}</span>
          <span class="tag">${esc(placeAges(p))}</span>
          ${p.free ? '<span class="tag free">Gratuit</span>' : ""}
        </div>
        <p class="src">${esc(p.l)}${p.ax ? " · zona aproximativă" : ""}</p>
      </div>`;
    b.addEventListener("click", () => openPlace(p.id, true));
    return b;
  }

  function renderPlaces() {
    const items = filteredPlaces();
    const n = `${items.length} ${items.length === 1 ? "loc" : "locuri"}`;
    $("count").innerHTML = `Locuri &amp; activități <small>· ${n}</small>`;
    const list = $("list");
    list.replaceChildren();
    if (!items.length) {
      const d = document.createElement("div");
      d.className = "empty";
      d.innerHTML = "<strong>Niciun loc pentru aceste filtre.</strong>Încercați altă categorie sau altă grupă de vârstă.";
      list.appendChild(d);
      return;
    }
    const intro = document.createElement("p");
    intro.className = "note";
    intro.textContent = "Locuri de vizitat și activități disponibile în orice zi, în Timișoara și la maximum 50 km. Programul și prețurile se schimbă: verificați pe site-ul oficial înainte de deplasare.";
    list.appendChild(intro);
    for (const [cat, label] of Object.entries(PCATS)) {
      const inCat = items.filter((p) => p.cat === cat).sort((a, b) => a.km - b.km);
      if (!inCat.length) continue;
      const h = document.createElement("h3"); h.className = "day"; h.textContent = label; list.appendChild(h);
      const grid = document.createElement("div"); grid.className = "grid"; grid.append(...inCat.map(placeCard)); list.appendChild(grid);
    }
  }

  function openPlace(id, push) {
    const p = PLACES.find((x) => x.id === id);
    if (!p) return closeDetail();
    if (push) { listScroll = window.scrollY; try { history.pushState({ cf: "detail" }, "", "#loc-" + id); } catch (_) {} }
    const dir = `https://www.google.com/maps/dir/?api=1&destination=${p.lat},${p.lng}`;
    const sec = $("detail");
    sec.innerHTML = `
      <button type="button" class="back" id="back">← Înapoi la listă</button>
      <div class="dhead">
        <div class="tags"><span class="tag">${esc(PCATS[p.cat] || p.cat)}</span>${p.free ? '<span class="tag free">Gratuit</span>' : ""}</div>
        <h2>${esc(p.n)}</h2>
        <p>${esc(p.d)}</p>
      </div>
      <dl class="facts">
        <dt>Unde</dt><dd>${esc(p.a)}${fold(p.a).includes(fold(p.l)) ? "" : ", " + esc(p.l)}<br><span class="km">${km(p.km)} în linie dreaptă de centrul Timișoarei${p.ax ? " · poziție aproximativă (zona)" : ""}</span></dd>
        <dt>Pentru</dt><dd>${esc(placeAges(p))}</dd>
        <dt>Tip</dt><dd>${esc(IO[p.io] || "")}</dd>
        <dt>Program</dt><dd><span class="note">Programul și prețurile se pot schimba. Verificați pe site-ul oficial sau telefonic înainte de deplasare.</span></dd>
      </dl>
      <div class="actions">
        ${p.u ? `<a class="btn primary" href="${esc(p.u)}" target="_blank" rel="noopener">Site oficial ↗</a>` : ""}
        <a class="btn${p.u ? "" : " primary"}" href="${dir}" target="_blank" rel="noopener">Indicații pe hartă ↗</a>
      </div>`;
    $("list").hidden = true; $("count").hidden = true; $("bar").hidden = true; sec.hidden = false;
    $("back").addEventListener("click", () => (history.state && history.state.cf === "detail" ? history.back() : closeDetail()));
    window.scrollTo(0, 0);
  }

  function setView(v) {
    if (S.view === v) return;
    S.view = v;
    try { history.replaceState(null, "", v === "places" ? "#locuri" : location.pathname + location.search); } catch (_) {}
    render();
    window.scrollTo(0, 0);
  }

  function openDetail(id, push) {
    const e = EVENTS.find((x) => x.id === id);
    if (!e) return closeDetail();
    if (push) { listScroll = window.scrollY; try { history.pushState({ cf: "detail" }, "", "#" + id); } catch (_) {} }
    const upcoming = e.s.filter((s) => s.d >= todayBucharest());
    const [al] = ageLabel(e);
    const pr = price(e);
    const dir = e.v.lat != null ? `https://www.google.com/maps/dir/?api=1&destination=${e.v.lat},${e.v.lng}` : null;
    const addr = e.v.a && fold(e.v.a).includes(fold(e.v.l)) ? e.v.a : [e.v.a, e.v.l].filter(Boolean).join(", ");
    const sum = usefulSummary(e);
    const sec = $("detail");
    sec.innerHTML = `
      <button type="button" class="back" id="back">← Înapoi la listă</button>
      <div class="dhead">
        <div class="tags">${e.cat.map((c) => `<span class="tag">${esc(CATS[c] || c)}</span>`).join("")}${e.c ? '<span class="tag x">ANULAT</span>' : ""}</div>
        <h2>${esc(e.title)}</h2>
        ${sum ? `<p>${esc(sum)}</p>` : ""}
        ${e.c ? '<p class="alert x">Acest eveniment a fost anulat conform sursei.</p>' : ""}
        ${e.note ? `<p class="alert">${esc(e.note)}</p>` : ""}
      </div>
      <dl class="facts">
        <dt>Când</dt><dd>${upcoming.length ? upcoming.slice(0, 10).map((s) => `<div${s.x ? ' style="text-decoration:line-through"' : ""}><strong>${esc(cap(human(s.d)))}</strong>${s.t ? `, ${s.t}${s.e ? "–" + s.e : ""}` : ""}</div>`).join("") : "Atracție permanentă; programul nu este confirmat."}</dd>
        <dt>Unde</dt><dd><strong>${esc(e.v.n)}</strong><br>${esc(addr)}<br><span class="km">${km(e.v.km)} în linie dreaptă de centrul Timișoarei</span></dd>
        <dt>Vârstă</dt><dd>${e.min ? `<strong>Restricție oficială: ${e.min}+${e.max ? ` (max. ${e.max})` : ""}</strong><br>` : "Fără restricție oficială publicată.<br>"}<span class="note">Recomandat: ${esc(e.all ? "toate vârstele" : e.ag.map((id) => group(id)[1]).join(", ") || al)}. Recomandările sunt orientative.</span></dd>
        ${pr ? `<dt>Preț</dt><dd>${esc(pr)}</dd>` : ""}
        ${e.org ? `<dt>Organizator</dt><dd>${esc(e.org)}</dd>` : ""}
        ${e.acc ? `<dt>Acces</dt><dd>${esc(e.acc)}</dd>` : ""}
        <dt>Surse</dt><dd>${e.src.map((x) => `<a href="${esc(x.u)}" target="_blank" rel="noopener">${esc(x.n)} ↗</a>`).join("<br>")}<br><span class="note">Verificat: ${esc(e.ver)}</span></dd>
      </dl>
      <div class="actions">
        ${e.tix && !e.c ? `<a class="btn primary" href="${esc(e.tix)}" target="_blank" rel="noopener nofollow">Bilete / rezervare ↗</a>` : ""}
        ${dir ? `<a class="btn" href="${dir}" target="_blank" rel="noopener">Indicații pe hartă ↗</a>` : ""}
      </div>
      <p class="note">Datele pot fi modificate de organizator. Verificați la sursa oficială înainte de deplasare.</p>`;
    $("list").hidden = true; $("count").hidden = true; $("bar").hidden = true; sec.hidden = false;
    $("back").addEventListener("click", () => (history.state && history.state.cf === "detail" ? history.back() : closeDetail()));
    window.scrollTo(0, 0);
  }

  let listScroll = 0;
  function closeDetail() {
    $("detail").hidden = true; $("list").hidden = false; $("count").hidden = false; $("bar").hidden = false;
    const keep = S.view === "places" ? "#locuri" : "";
    if (location.hash !== keep) { try { history.replaceState(null, "", location.pathname + location.search + keep); } catch (_) {} }
    window.scrollTo(0, listScroll);
  }

  function render() { renderBar(); if (S.view === "places") renderPlaces(); else renderList(); }

  // ---------- Filter sheet: full screen on phones, OK applies and returns to the start of the list ----------
  function openSheet() {
    $("panel").hidden = false; document.documentElement.classList.add("lock"); $("more").setAttribute("aria-expanded", "true");
    renderPanel();
    try { history.pushState({ cf: "sheet" }, "", location.href); } catch (_) {}
    $("panel-close").focus();
  }
  function closeSheet() {
    if ($("panel").hidden) return;
    $("panel").hidden = true; document.documentElement.classList.remove("lock"); $("more").setAttribute("aria-expanded", "false");
    window.scrollTo(0, 0);
    $("more").focus({ preventScroll: true });
  }
  // Closing goes through history when the sheet added an entry, so the phone's Back button and OK agree.
  const dismissSheet = () => (history.state && history.state.cf === "sheet" ? history.back() : closeSheet());
  const resetFilters = () => { Object.assign(S, { ages: [], family: false, cats: [], price: "", io: "", tod: [], dist: "", loc: "" }); save(); render(); };
  // We place the scroll ourselves (top after OK, previous position after a detail), not the browser.
  try { history.scrollRestoration = "manual"; } catch (_) {}
  $("more").addEventListener("click", openSheet);
  $("panel-ok").addEventListener("click", dismissSheet);
  $("panel-close").addEventListener("click", dismissSheet);
  $("panel-reset").addEventListener("click", resetFilters);
  document.addEventListener("keydown", (ev) => { if (ev.key === "Escape" && !$("panel").hidden) dismissSheet(); });
  window.addEventListener("popstate", () => {
    if (!$("panel").hidden) closeSheet();
    else if (!$("detail").hidden) closeDetail();
  });
  $("reset").addEventListener("click", resetFilters);
  $("tab-events").addEventListener("click", () => setView("events"));
  $("tab-places").addEventListener("click", () => setView("places"));
  $("built").textContent = `Actualizat: ${DATA.built} (ora României) · ${EVENTS.length} evenimente verificate · ${PLACES.length} locuri de vizitat.`;

  const h = location.hash.slice(1);
  if (h === "locuri" || h.startsWith("loc-")) S.view = "places";
  render();
  if (h.startsWith("loc-") && PLACES.some((p) => p.id === h.slice(4))) openPlace(h.slice(4), false);
  else if (h && EVENTS.some((e) => e.id === h)) openDetail(h, false);
})();
