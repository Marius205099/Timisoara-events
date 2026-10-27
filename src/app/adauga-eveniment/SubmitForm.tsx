"use client";

import { useActionState } from "react";
import { submitEvent, type SubmitState } from "./actions";

export function SubmitForm() {
  const [state, action, pending] = useActionState<SubmitState, FormData>(submitEvent, { ok: false, message: "" });
  const err = (k: string) => state.errors?.[k];

  if (state.ok) {
    return (
      <div role="status" className="card mt-6 p-6 text-center">
        <p className="text-4xl" aria-hidden>✅</p>
        <p className="mt-2 font-semibold">{state.message}</p>
      </div>
    );
  }

  return (
    <form action={action} className="mt-6 space-y-4" noValidate>
      {state.message && (
        <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-800">{state.message}</p>
      )}
      <input type="text" name="website" tabIndex={-1} autoComplete="off" className="hidden" aria-hidden />
      <Field name="title" label="Titlul evenimentului *" error={err("title")} />
      <div className="grid grid-cols-2 gap-3">
        <Field name="date" label="Data *" type="date" error={err("date")} />
        <Field name="time" label="Ora începerii *" type="time" error={err("time")} />
      </div>
      <Field name="endTime" label="Ora de final" type="time" error={err("endTime")} />
      <Field name="venueName" label="Locul desfășurării (sală, parc, local) *" error={err("venueName")} />
      <Field name="venueAddress" label="Adresa exactă a locului *" placeholder="Str. …, nr. …" error={err("venueAddress")} />
      <Field name="locality" label="Localitatea *" placeholder="Timișoara, Dumbrăvița, Giroc…" error={err("locality")} />
      <p className="-mt-2 text-xs text-slate-500">Contează adresa locului unde are loc evenimentul, nu sediul organizatorului.</p>
      <Field name="organizerName" label="Organizator" error={err("organizerName")} />
      <div>
        <label className="label" htmlFor="description">Descriere</label>
        <textarea id="description" name="description" rows={5} className="input py-2" maxLength={5000} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field name="officialMinAge" label="Vârstă minimă oficială" type="number" inputMode="numeric" placeholder="ex. 18" error={err("officialMinAge")} />
        <Field name="priceText" label="Preț" placeholder="Gratuit / 50 lei" error={err("priceText")} />
      </div>
      <Field name="ticketUrl" label="Link bilete" type="url" inputMode="url" error={err("ticketUrl")} />
      <Field name="sourceUrl" label="Link oficial al evenimentului" type="url" inputMode="url" error={err("sourceUrl")} />
      <Field name="contactEmail" label="Emailul dvs. (nu se publică) *" type="email" inputMode="email" autoComplete="email" error={err("contactEmail")} />
      <label className="flex min-h-[44px] items-center gap-3 text-sm">
        <input type="checkbox" name="online" className="h-5 w-5" /> Evenimentul este exclusiv online
      </label>
      <button type="submit" disabled={pending} className="btn-primary w-full">
        {pending ? "Se verifică locația…" : "Trimite spre verificare"}
      </button>
    </form>
  );
}

function Field({ name, label, error, ...rest }: { name: string; label: string; error?: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div>
      <label className="label" htmlFor={name}>{label}</label>
      <input id={name} name={name} className={`input ${error ? "border-red-500" : ""}`} aria-invalid={!!error} aria-describedby={error ? `${name}-err` : undefined} {...rest} />
      {error && <p id={`${name}-err`} className="mt-1 text-sm text-red-700">{error}</p>}
    </div>
  );
}
