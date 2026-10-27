import { ImageResponse } from "next/og";
import { getDb } from "@/data/db";
import { getPublicEventBySlug } from "@/data/public";
import { formatSessionRo } from "@/lib/dates";
import { formatKm } from "@/lib/geo";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "Eveniment în Timișoara";

export default async function Og({ params }: { params: Promise<{ slug: string }> }) {
  const e = await getPublicEventBySlug(await getDb(), (await params).slug);
  const s = e?.sessions[0];
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", padding: 72, background: "linear-gradient(135deg, #1d4ed8, #1e40af)", color: "white" }}>
        <div style={{ fontSize: 30, color: "#bfdbfe" }}>Ce facem în Timișoara?</div>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ fontSize: 68, fontWeight: 800, lineHeight: 1.1 }}>{(e?.title ?? "Eveniment").slice(0, 80)}</div>
          {s && <div style={{ fontSize: 38, marginTop: 24, color: "#fed7aa" }}>{formatSessionRo(s.startsAt, s.endsAt, s.allDay)}</div>}
          {e && <div style={{ fontSize: 34, marginTop: 12, color: "#dbeafe" }}>{`${e.venue.name}, ${e.venue.locality} · ${formatKm(e.venue.distanceKm ?? 0)}`}</div>}
        </div>
      </div>
    ),
    size,
  );
}
