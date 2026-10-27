"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getDb } from "@/data/db";
import {
  adminMergeDuplicate, adminRelocateVenue, adminSetSourceEnabled, adminSetStatus, adminUpdateEvent, GeofenceViolation,
} from "@/data/admin";
import { approveSubmission } from "@/data/submissions";
import { runAllSources } from "@/ingestion/pipeline";
import { manualSlot } from "@/ingestion/schedule";
import { authMode, logout, passwordLogin, requireAdmin, supabaseServer } from "@/lib/auth";
import { AGE_GROUP_IDS, CATEGORY_IDS, type AgeGroupId, type CategoryId } from "@/lib/taxonomy";
import type { EventStatus } from "@/lib/types";

const back = (form: FormData, fallback: string) => String(form.get("back") || fallback);
const withMsg = (path: string, key: "ok" | "err", msg: string) => `${path}${path.includes("?") ? "&" : "?"}${key}=${encodeURIComponent(msg)}`;

export async function loginAction(form: FormData) {
  const mode = authMode();
  if (mode === "supabase") {
    const sb = await supabaseServer();
    const { error } = await sb.auth.signInWithPassword({ email: String(form.get("email")), password: String(form.get("password")) });
    if (error) redirect("/admin/login?err=" + encodeURIComponent("Autentificare eșuată."));
  } else if (mode === "password") {
    if (!(await passwordLogin(String(form.get("password") ?? "")))) redirect("/admin/login?err=" + encodeURIComponent("Parolă greșită."));
  } else {
    redirect("/admin/login");
  }
  redirect("/admin");
}

export async function logoutAction() {
  await logout();
  redirect("/admin/login");
}

export async function setStatusAction(form: FormData) {
  const admin = await requireAdmin();
  const id = String(form.get("id"));
  const status = String(form.get("status")) as EventStatus;
  const to = back(form, `/admin/evenimente/${id}`);
  try {
    await adminSetStatus(await getDb(), admin.userId, id, status, String(form.get("reason") || "") || undefined);
  } catch (e) {
    redirect(withMsg(to, "err", e instanceof GeofenceViolation ? e.message : (e as Error).message));
  }
  revalidatePath("/");
  redirect(withMsg(to, "ok", `Status: ${status}`));
}

const numOrNull = (v: FormDataEntryValue | null) => (v === null || v === "" ? null : Number(v));

export async function updateEventAction(form: FormData) {
  const admin = await requireAdmin();
  const id = String(form.get("id"));
  const isFree = form.get("isFree");
  await adminUpdateEvent(await getDb(), admin.userId, id, {
    title: String(form.get("title") ?? "").trim() || undefined,
    summary: String(form.get("summary") ?? "").trim() || undefined,
    description: String(form.get("description") ?? "").trim() || null,
    officialMinAge: numOrNull(form.get("officialMinAge")),
    officialMaxAge: numOrNull(form.get("officialMaxAge")),
    isFree: isFree === "yes" ? true : isFree === "no" ? false : null,
    priceMin: numOrNull(form.get("priceMin")),
    priceMax: numOrNull(form.get("priceMax")),
    ticketUrl: String(form.get("ticketUrl") ?? "").trim() || null,
    accessibility: String(form.get("accessibility") ?? "").trim() || null,
    indoorOutdoor: String(form.get("indoorOutdoor") || "") || undefined,
    allAges: form.get("allAges") === "on",
    familyFriendly: form.get("familyFriendly") === "on",
    uncertaintyNote: String(form.get("uncertaintyNote") ?? "").trim() || null,
    categories: form.getAll("categories").map(String).filter((c): c is CategoryId => (CATEGORY_IDS as string[]).includes(c)),
    ageGroups: form.getAll("ageGroups").map(String).filter((g): g is AgeGroupId => (AGE_GROUP_IDS as string[]).includes(g)),
  });
  revalidatePath("/");
  redirect(withMsg(`/admin/evenimente/${id}`, "ok", "Salvat"));
}

export async function relocateVenueAction(form: FormData) {
  const admin = await requireAdmin();
  const eventId = String(form.get("eventId"));
  const to = `/admin/evenimente/${eventId}`;
  let msg = "";
  try {
    const v = await adminRelocateVenue(await getDb(), admin.userId, String(form.get("venueId")), Number(form.get("lat")), Number(form.get("lng")));
    msg = `Locație actualizată: ${v?.distance_km} km, status ${v?.geo_status}`;
  } catch (e) {
    redirect(withMsg(to, "err", (e as Error).message));
  }
  revalidatePath("/");
  redirect(withMsg(to, "ok", msg));
}

export async function triggerIngestionAction(form: FormData) {
  await requireAdmin();
  const sourceId = String(form.get("sourceId") || "");
  // On Vercel, long runs belong to the GitHub Actions worker; dispatch it when configured.
  if (process.env.GITHUB_DISPATCH_TOKEN && process.env.GITHUB_REPOSITORY) {
    const r = await fetch(`https://api.github.com/repos/${process.env.GITHUB_REPOSITORY}/actions/workflows/ingest.yml/dispatches`, {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.GITHUB_DISPATCH_TOKEN}`, Accept: "application/vnd.github+json" },
      body: JSON.stringify({ ref: process.env.GITHUB_REF_NAME ?? "main", inputs: { source: sourceId } }),
    });
    redirect(withMsg("/admin/surse", r.ok ? "ok" : "err", r.ok ? "Colectare pornită (GitHub Actions)." : `GitHub: ${r.status}`));
  }
  const res = await runAllSources(await getDb(), { slotKey: manualSlot(), trigger: "manual", sourceIds: sourceId ? [sourceId] : undefined });
  const summary = Object.entries(res.results).map(([k, v]) => `${k}: ${v.status} (${v.stats.published} publicate, ${v.stats.needsReview} în revizuire, ${v.stats.outOfRadius} >50 km)`).join("; ");
  revalidatePath("/");
  redirect(withMsg("/admin/surse", "ok", summary || "Nicio sursă rulată."));
}

export async function toggleSourceAction(form: FormData) {
  const admin = await requireAdmin();
  await adminSetSourceEnabled(await getDb(), admin.userId, String(form.get("id")), form.get("enabled") === "true",
    form.get("autoPublish") === null ? undefined : form.get("autoPublish") === "true");
  redirect("/admin/surse");
}

export async function submissionAction(form: FormData) {
  const admin = await requireAdmin();
  const id = String(form.get("id"));
  const db = await getDb();
  if (form.get("decision") === "approve") {
    const r = await approveSubmission(db, admin.userId, id);
    redirect(r.eventId ? withMsg(`/admin/evenimente/${r.eventId}`, "ok", `Creat (${r.status}: ${r.reason}). Verificați și publicați.`) : "/admin/trimiteri");
  }
  await db.tx(async (t) => {
    await t.query(`update event_submissions set status = 'rejected' where id = $1`, [id]);
    await t.query(`insert into admin_reviews (submission_id, action, admin_id) values ($1, 'reject_submission', $2)`, [id, admin.userId]);
  }, { asUser: admin.userId });
  redirect("/admin/trimiteri");
}

export async function mergeAction(form: FormData) {
  const admin = await requireAdmin();
  await adminMergeDuplicate(await getDb(), admin.userId, String(form.get("keep")), String(form.get("drop")));
  revalidatePath("/");
  redirect(withMsg("/admin/duplicate", "ok", "Consolidat."));
}

export async function resolveErrorAction(form: FormData) {
  const admin = await requireAdmin();
  await (await getDb()).tx(async (t) => {
    await t.query(`update ingestion_errors set resolved = true where id = $1`, [String(form.get("id"))]);
  }, { asUser: admin.userId });
  redirect("/admin/surse");
}
