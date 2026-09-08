import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import type { UseFormRegisterReturn } from "react-hook-form";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDate(value: string | Date | null | undefined) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-IN", { dateStyle: "medium" }).format(new Date(value));
}

export function formatDateTime(value: string | Date | null | undefined) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short" }).format(
    new Date(value),
  );
}

export function formatCurrency(value: number | string | null | undefined) {
  const n = typeof value === "string" ? Number(value) : (value ?? 0);
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(Number.isFinite(n) ? n : 0);
}

/** Collapse whitespace + lowercase — the basis of duplicate detection. */
export function normalizeName(value: string | null | undefined) {
  return (value ?? "").trim().replace(/\s+/g, " ").toLowerCase();
}

export function titleCase(value: string) {
  return value.replace(/\w\S*/g, (t) => t.charAt(0).toUpperCase() + t.slice(1).toLowerCase());
}

/** Given name + surname — how a student is referred to day-to-day. Middle name
 *  (the father's name) is shown separately wherever that context matters.
 *  Salutation (Mr./Ms./…) is prepended when present — callers that don't pass
 *  it (or pass a row without the column) get the old unprefixed behavior. */
export function studentName(s: { salutation?: string | null; first_name: string; last_name: string }) {
  return [s.salutation, s.first_name, s.last_name].filter(Boolean).join(" ").trim();
}

/** Wraps a react-hook-form `register(...)` result so the field's actual
 *  value — not just how it's displayed — is forced to uppercase as the user
 *  types or pastes. Mutates the input's DOM value before react-hook-form's
 *  own onChange reads it, so what ends up in form state (and eventually the
 *  database) is genuinely uppercase, not just styled that way. */
export function uppercaseRegister(reg: UseFormRegisterReturn): UseFormRegisterReturn {
  return {
    ...reg,
    onChange: (e: Parameters<UseFormRegisterReturn["onChange"]>[0]) => {
      (e.target as HTMLInputElement).value = (e.target as HTMLInputElement).value.toUpperCase();
      return reg.onChange(e);
    },
  };
}

/** Same idea as uppercaseRegister, but strips anything that isn't a digit —
 *  for a mobile number field where letters/symbols should never even be
 *  typeable, not just rejected after the fact on submit. */
export function digitsOnlyRegister(reg: UseFormRegisterReturn): UseFormRegisterReturn {
  return {
    ...reg,
    onChange: (e: Parameters<UseFormRegisterReturn["onChange"]>[0]) => {
      (e.target as HTMLInputElement).value = (e.target as HTMLInputElement).value.replace(/\D/g, "");
      return reg.onChange(e);
    },
  };
}

/** Full legal name including the father's name, for certificates/official use. */
export function studentFullName(s: {
  salutation?: string | null;
  first_name: string;
  middle_name?: string | null;
  last_name: string;
}) {
  return [s.salutation, s.first_name, s.middle_name, s.last_name].filter(Boolean).join(" ");
}
