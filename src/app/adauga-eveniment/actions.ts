"use server";

import { headers } from "next/headers";
import { getDb } from "@/data/db";
import { createSubmission, SubmissionSchema } from "@/data/submissions";

export interface SubmitState {
  ok: boolean;
  message: string;
  errors?: Record<string, string>;
}

// Simple per-IP limiter (per server instance) + honeypot field against spam bots.
const hits = new Map<string, number[]>();
function rateLimited(ip: string): boolean {
  const now = Date.now();
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < 3600_000);
  recent.push(now);
  hits.set(ip, recent);
  return recent.length > 5;
}

export async function submitEvent(_prev: SubmitState, form: FormData): Promise<SubmitState> {
  if (form.get("website")) return { ok: true, message: "Mulțumim!" }; // honeypot
  const ip = (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  if (rateLimited(ip)) return { ok: false, message: "Prea multe trimiteri. Încercați din nou peste o oră." };

  const parsed = SubmissionSchema.safeParse(Object.fromEntries(form.entries()));
  if (!parsed.success) {
    const errors: Record<string, string> = {};
    for (const i of parsed.error.issues) errors[String(i.path[0])] ??= i.message;
    return { ok: false, message: "Verificați câmpurile marcate.", errors };
  }
  try {
    const r = await createSubmission(await getDb(), parsed.data);
    if (r.status === "rejected") {
      return {
        ok: false,
        message:
          r.reason === "online_only"
            ? "Publicăm doar evenimente cu prezență fizică."
            : `Locația pare să fie la ${r.distanceKm} km de centrul Timișoarei — peste limita de 50 km. Dacă este o eroare, verificați adresa.`,
      };
    }
    return { ok: true, message: "Mulțumim! Evenimentul a fost trimis spre verificare. Vă vom contacta pe email dacă avem întrebări." };
  } catch (e) {
    return { ok: false, message: (e as Error).message || "Eroare la trimitere." };
  }
}
