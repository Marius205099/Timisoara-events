import { NextResponse } from "next/server";
import { getDb } from "@/data/db";
import { logIngestionError, runAllSources } from "@/ingestion/pipeline";
import { slotFor } from "@/ingestion/schedule";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * HTTP trigger for schedulers (Vercel Cron on Pro, or any external cron).
 * Requires `Authorization: Bearer $CRON_SECRET`. Runs only inside the 06:00 / 18:00
 * Bucharest windows unless `?force=1`; the slot key makes repeated calls no-ops.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const url = new URL(req.url);
  const slot = url.searchParams.get("force") === "1" ? `forced-${new Date().toISOString().slice(0, 13)}` : slotFor();
  if (!slot) return NextResponse.json({ skipped: true, reason: "outside 06:00/18:00 Europe/Bucharest window" });
  const db = await getDb();
  try {
    const res = await runAllSources(db, { slotKey: slot, trigger: "schedule", sourceIds: url.searchParams.get("source")?.split(",") });
    return NextResponse.json({ slot, ...res });
  } catch (e) {
    await logIngestionError(db, { stage: "run", message: (e as Error).message });
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
