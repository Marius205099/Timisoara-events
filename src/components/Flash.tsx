export function Flash({ ok, err }: { ok?: string; err?: string }) {
  if (!ok && !err) return null;
  return (
    <p role={err ? "alert" : "status"} className={`mb-4 rounded-xl p-3 text-sm ${err ? "bg-red-50 text-red-800" : "bg-emerald-50 text-emerald-900"}`}>
      {err ?? ok}
    </p>
  );
}

export const STATUS_LABEL: Record<string, string> = {
  published: "Publicat", needs_review: "De verificat", rejected: "Respins", canceled: "Anulat", archived: "Arhivat", draft: "Ciornă",
};

export const REASON_LABEL: Record<string, string> = {
  out_of_radius: "În afara razei de 50 km",
  venue_not_found: "Locație negăsită",
  venue_unknown: "Locație nespecificată",
  low_confidence_location: "Geocodare nesigură",
  near_boundary: "Aproape de limita de 50 km",
  online_only: "Exclusiv online",
  geocoder_error: "Eroare geocodare",
  moderation_required: "Necesită moderare",
  invalid_dates: "Date invalide",
  postponed_by_source: "Amânat la sursă",
};

export function StatusBadge({ s }: { s: string }) {
  const cls: Record<string, string> = {
    published: "bg-emerald-100 text-emerald-800", needs_review: "bg-amber-100 text-amber-900", rejected: "bg-red-100 text-red-800",
    canceled: "bg-slate-200 text-slate-700", archived: "bg-slate-100 text-slate-500",
  };
  return <span className={`badge ${cls[s] ?? "bg-slate-100"}`}>{STATUS_LABEL[s] ?? s}</span>;
}
