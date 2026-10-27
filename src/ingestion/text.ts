import * as cheerio from "cheerio";

/** HTML → plain text, entities decoded, whitespace collapsed. */
export function htmlToText(html: string | null | undefined): string {
  if (!html) return "";
  const $ = cheerio.load(`<div id="r">${html}</div>`);
  $("script,style").remove();
  $("br").replaceWith("\n");
  $("p,div,li").each((_, el) => {
    $(el).append("\n");
  });
  return $("#r")
    .text()
    .replace(/\[[^\]]*\]/g, " ") // WordPress shortcodes
    .replace(/[ \t ]+/g, " ")
    .replace(/\s*\n\s*/g, "\n")
    .replace(/\n{2,}/g, "\n")
    .trim();
}

export function truncate(s: string, n: number): string {
  if (s.length <= n) return s;
  const cut = s.slice(0, n);
  return cut.slice(0, Math.max(cut.lastIndexOf(" "), n - 20)).trimEnd() + "…";
}

const CANCEL_RE = /\b(anulat|anulată|anulata|canceled|cancelled|abgesagt|amânat|amanat|reprogramat|postponed)\b/i;

export function detectStatusFromText(...texts: (string | null | undefined)[]): "canceled" | "postponed" | null {
  const t = texts.filter(Boolean).join(" ");
  const m = t.match(CANCEL_RE);
  if (!m) return null;
  return /am[âa]nat|reprogramat|postponed/i.test(m[0]) ? "postponed" : "canceled";
}

export function parsePriceText(text: string | null | undefined): {
  isFree: boolean | null;
  min: number | null;
  max: number | null;
  currency: string | null;
} {
  if (!text) return { isFree: null, min: null, max: null, currency: null };
  const t = text.toLowerCase();
  if (/\b(gratuit|gratis|intrare liber[ăa]|free|acces liber)\b/.test(t)) return { isFree: true, min: 0, max: 0, currency: "RON" };
  const nums = [...t.matchAll(/(\d+(?:[.,]\d+)?)/g)].map((m) => Number(m[1].replace(",", "."))).filter((n) => n > 0 && n < 100000);
  if (!nums.length) return { isFree: null, min: null, max: null, currency: null };
  const currency = /eur|€/.test(t) ? "EUR" : "RON";
  return { isFree: false, min: Math.min(...nums), max: Math.max(...nums), currency };
}

/** Splits "Name, Street 2, Timișoara, 300086, Romania" into name/address/locality. */
export function splitLocation(loc: string | null | undefined): { name: string | null; address: string | null; locality: string | null } {
  if (!loc) return { name: null, address: null, locality: null };
  const parts = loc.split(",").map((p) => p.trim()).filter(Boolean);
  const cleaned = parts.filter((p) => !/^(romania|românia|ro)$/i.test(p) && !/^\d{6}$/.test(p));
  const locality = guessLocality(loc);
  return {
    name: parts[0] ?? null,
    address: parts.length > 1 ? cleaned.slice(1).join(", ") || null : null,
    locality,
  };
}

/** Recognizes a locality name inside free text. Used for display only — never for eligibility. */
export function guessLocality(text: string | null | undefined): string | null {
  if (!text) return null;
  const known = [
    "Timișoara", "Timisoara", "Dumbrăvița", "Dumbravita", "Giroc", "Chișoda", "Ghiroda", "Moșnița Nouă", "Mosnita Noua",
    "Sânandrei", "Sanandrei", "Săcălaz", "Sacalaz", "Recaș", "Recas", "Buziaș", "Buzias", "Deta", "Jimbolia", "Lugoj",
    "Arad", "Sânnicolau Mare", "Ciacova", "Dudeștii Noi", "Remetea Mare", "Utvin", "Sag", "Șag", "Covaci", "Becicherecu Mic",
    "Orțișoara", "Variaș", "Lovrin", "Făget", "Oradea", "București", "Cluj-Napoca", "Reșița",
  ];
  const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const t = norm(text);
  const hit = known.find((k) => new RegExp(`\\b${norm(k).replace(/[-]/g, "\\-")}\\b`).test(t));
  if (!hit) return null;
  const canonical: Record<string, string> = {
    timisoara: "Timișoara", dumbravita: "Dumbrăvița", "mosnita noua": "Moșnița Nouă", sanandrei: "Sânandrei",
    sacalaz: "Săcălaz", recas: "Recaș", buzias: "Buziaș", sag: "Șag",
  };
  return canonical[norm(hit)] ?? hit;
}
