import "server-only";
import crypto from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createServerClient } from "@supabase/ssr";
import { getDb } from "@/data/db";
import { isAdmin } from "@/data/admin";
import { isEmbeddedMode, isSupabaseAuthConfigured } from "./config";

/**
 * Admin authentication.
 *  - Production: Supabase Auth (email + password). A user is an admin only if listed
 *    in `admin_users`; admin writes then run under RLS with that user's id.
 *  - Local/demo (embedded DB, no Supabase Auth): a single ADMIN_PASSWORD with an
 *    HMAC-signed, httpOnly cookie. Disabled when the password is not set.
 */

export const LOCAL_ADMIN_ID = "00000000-0000-4000-8000-000000000001";
const LOCAL_COOKIE = "cf_admin";

export interface AdminSession {
  userId: string;
  email: string;
}

export async function supabaseServer() {
  const store = await cookies();
  return createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (list) => {
        try {
          for (const c of list) store.set(c.name, c.value, c.options);
        } catch {
          /* called from a Server Component: cookies are read-only there */
        }
      },
    },
  });
}

const sign = (v: string) => crypto.createHmac("sha256", process.env.ADMIN_PASSWORD ?? "").update(v).digest("hex");

export const authMode = (): "supabase" | "password" | "disabled" =>
  isSupabaseAuthConfigured() ? "supabase" : isEmbeddedMode() && process.env.ADMIN_PASSWORD ? "password" : "disabled";

export async function getAdmin(): Promise<AdminSession | null> {
  const mode = authMode();
  if (mode === "supabase") {
    const sb = await supabaseServer();
    const { data } = await sb.auth.getUser();
    if (!data.user) return null;
    return (await isAdmin(await getDb(), data.user.id)) ? { userId: data.user.id, email: data.user.email ?? "" } : null;
  }
  if (mode === "password") {
    const c = (await cookies()).get(LOCAL_COOKIE)?.value;
    const [payload, mac] = (c ?? "").split(".");
    if (!payload || !mac) return null;
    const expected = sign(payload);
    if (expected.length !== mac.length || !crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(mac))) return null;
    if (Number(payload) < Date.now()) return null;
    await (await getDb()).query(`insert into admin_users (user_id, email) values ($1, 'local-admin') on conflict do nothing`, [LOCAL_ADMIN_ID]);
    return { userId: LOCAL_ADMIN_ID, email: "local-admin" };
  }
  return null;
}

export async function requireAdmin(): Promise<AdminSession> {
  const a = await getAdmin();
  if (!a) redirect("/admin/login");
  return a;
}

export async function passwordLogin(password: string): Promise<boolean> {
  const expected = process.env.ADMIN_PASSWORD ?? "";
  if (!expected || password.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(password), Buffer.from(expected))) return false;
  const exp = String(Date.now() + 12 * 3600_000);
  (await cookies()).set(LOCAL_COOKIE, `${exp}.${sign(exp)}`, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 12 * 3600 });
  return true;
}

export async function logout() {
  if (authMode() === "supabase") await (await supabaseServer()).auth.signOut();
  (await cookies()).delete(LOCAL_COOKIE);
}
