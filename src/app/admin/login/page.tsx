import type { Metadata } from "next";
import { loginAction } from "../actions";
import { authMode } from "@/lib/auth";

export const metadata: Metadata = { title: "Admin — autentificare", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function Login({ searchParams }: { searchParams: Promise<{ err?: string }> }) {
  const { err } = await searchParams;
  const mode = authMode();
  return (
    <main className="mx-auto max-w-sm px-4 py-16">
      <h1 className="text-2xl font-extrabold">Administrare</h1>
      {mode === "disabled" ? (
        <p className="mt-4 rounded-xl bg-amber-50 p-3 text-sm text-amber-900">
          Autentificarea nu este configurată. Setați Supabase Auth (producție) sau ADMIN_PASSWORD (mod local). Vezi README.
        </p>
      ) : (
        <form action={loginAction} className="mt-6 space-y-4">
          {err && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-800">{err}</p>}
          {mode === "supabase" && (
            <div>
              <label className="label" htmlFor="email">Email</label>
              <input id="email" name="email" type="email" autoComplete="username" required className="input" />
            </div>
          )}
          <div>
            <label className="label" htmlFor="password">Parolă</label>
            <input id="password" name="password" type="password" autoComplete="current-password" required className="input" />
          </div>
          <button className="btn-primary w-full">Intră</button>
        </form>
      )}
    </main>
  );
}
