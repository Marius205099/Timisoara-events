/**
 * Ingestion worker (GitHub Actions or any server):
 *   npm run ingest                 # runs only inside the 06:00 / 18:00 Bucharest slot windows
 *   npm run ingest -- --manual     # run now (unique manual slot)
 *   npm run ingest -- --manual --source tntm,iabilet
 * Needs DATABASE_URL (Supabase) — without it, it fills the local embedded database.
 */
import { getDb } from "../src/data/db";
import { logIngestionError, runAllSources } from "../src/ingestion/pipeline";
import { manualSlot, slotFor } from "../src/ingestion/schedule";

async function main() {
  const args = process.argv.slice(2);
  const manual = args.includes("--manual");
  const sourceArg = args[args.indexOf("--source") + 1];
  const slot = manual ? manualSlot() : slotFor();
  if (!slot) {
    console.log("Outside the 06:00/18:00 Europe/Bucharest windows — nothing to do.");
    return;
  }
  const db = await getDb();
  console.log(`Ingestion slot ${slot}${process.env.DATABASE_URL ? "" : " (embedded local database)"}`);
  try {
    const res = await runAllSources(db, { slotKey: slot, trigger: manual ? "manual" : "schedule", sourceIds: args.includes("--source") ? sourceArg.split(",") : undefined });
    for (const [id, r] of Object.entries(res.results)) console.log(`${id.padEnd(22)} ${r.status.padEnd(9)} ${JSON.stringify(r.stats)}`);
    console.log(`archived past events: ${res.archived}`);
    const failed = Object.values(res.results).filter((r) => r.status === "failed").length;
    if (failed && failed === Object.keys(res.results).length) process.exitCode = 1;
  } catch (e) {
    await logIngestionError(db, { stage: "run", message: (e as Error).message });
    throw e;
  }
}

main().then(() => process.exit(process.exitCode ?? 0)).catch((e) => {
  console.error(e);
  process.exit(1);
});
