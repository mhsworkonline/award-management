import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

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
 *  (the father's name) is shown separately wherever that context matters. */
export function studentName(s: { first_name: string; last_name: string }) {
  return `${s.first_name} ${s.last_name}`.trim();
}

/** Full legal name including the father's name, for certificates/official use. */
export function studentFullName(s: { first_name: string; middle_name?: string | null; last_name: string }) {
  return [s.first_name, s.middle_name, s.last_name].filter(Boolean).join(" ");
}
