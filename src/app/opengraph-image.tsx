import { ImageResponse } from "next/og";

export const alt = "Ce facem în Timișoara? — evenimente la maximum 50 km";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OgImage() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "center", padding: 80, background: "linear-gradient(135deg, #1d4ed8, #1e40af)", color: "white" }}>
        <div style={{ fontSize: 84, fontWeight: 800 }}>Ce facem în Timișoara?</div>
        <div style={{ fontSize: 40, marginTop: 24, color: "#dbeafe" }}>Evenimente și activități în Timișoara și la maximum 50 km.</div>
        <div style={{ fontSize: 32, marginTop: 48, color: "#fed7aa" }}>Azi · Mâine · Sâmbătă · Duminică · Weekend</div>
      </div>
    ),
    size,
  );
}
