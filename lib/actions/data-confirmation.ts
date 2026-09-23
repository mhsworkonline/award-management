"use server";

import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { ORG_ID } from "@/lib/constants";
import { confirmLookupSchema, confirmSubmitSchema } from "@/lib/validators";
import { FN } from "@/lib/tables";
import { message } from "@/lib/actions/crud";
import type { ActionResult, ConfirmLookupResult, ResolvedConfirmForm } from "@/lib/types";

/** Unauthenticated — resolves which form_type='confirm' row of
 *  am_application_forms /confirm (or /confirm/[slug]) should render. No
 *  slug = the org's current default (active-year form, else most recently
 *  created enabled one) — identical rule to resolveApplicationForm for
 *  /apply (see am_resolve_confirm_form, 0041). Wrapped in React's
 *  request-scoped cache so a page's generateMetadata and its body share one
 *  RPC round trip. */
export const resolveConfirmForm = cache(async (slug?: string): Promise<ActionResult<ResolvedConfirmForm>> => {
  try {
    const supabase = createClient();
    const { data, error } = await supabase.rpc(FN.resolveConfirmForm, {
      p_org_id: ORG_ID,
      p_slug: slug ?? null,
    });
    if (error) return { ok: false, error: error.message };
    return { ok: true, data: data as ResolvedConfirmForm };
  } catch (e) {
    return { ok: false, error: message(e) };
  }
});

/** The "S{yy}-" prefix a reference code was minted with for a given academic
 *  year label — same derivation am_submit_public_application uses (0031),
 *  just done in TS since the resolved form already carries the year label. */
function prefixFor(yearLabel: string) {
  const match = yearLabel.match(/\d{4}/);
  const short = match ? match[0].slice(-2) : String(new Date().getFullYear()).slice(-2);
  return `S${short}-`;
}

/** Unauthenticated — looks up one approved application by reference number
 *  + registered mobile number, both required to match (see am_confirm_lookup).
 *  Returns null data (not an error) when nothing matches, so the page can't
 *  tell a visitor whether it was the number or the phone that was wrong.
 *  `slug` re-resolves the same confirm form the page rendered, rather than
 *  trusting a client-supplied prefix, for whichever year that form is for. */
export async function lookupConfirmRecord(
  raw: unknown,
  slug?: string,
): Promise<ActionResult<ConfirmLookupResult | null>> {
  const parsed = confirmLookupSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      error: "Please correct the highlighted fields",
      fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
    };
  }

  try {
    const supabase = createClient();
    const form = await resolveConfirmForm(slug);
    if (!form.ok || !form.data) return { ok: true, data: null };

    const { data, error } = await supabase.rpc(FN.confirmLookup, {
      p_org_id: ORG_ID,
      p_reference_code: `${prefixFor(form.data.academicYear.label)}${parsed.data.reference_number}`,
      p_contact_no: parsed.data.contact_no,
    });
    if (error) return { ok: false, error: friendlyPublicError(error.message) };
    return { ok: true, data: (data as ConfirmLookupResult | null) ?? null };
  } catch (e) {
    return { ok: false, error: message(e) };
  }
}

/** Unauthenticated — records a confirmation or correction. Re-verifies the
 *  code+phone match itself (am_submit_data_confirmation calls
 *  am_confirm_lookup internally) rather than trusting the lookup the page
 *  already did, the same "never trust the client already checked" posture
 *  submitPublicApplication takes. */
export async function submitDataConfirmation(
  raw: unknown,
  hasChanges: boolean,
  slug?: string,
): Promise<ActionResult<{ id: string }>> {
  const parsed = confirmSubmitSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      error: "Please correct the highlighted fields",
      fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
    };
  }

  try {
    const supabase = createClient();
    const form = await resolveConfirmForm(slug);
    if (!form.ok || !form.data || !form.data.is_enabled) {
      return { ok: false, error: "Confirmations aren't open right now." };
    }

    const { data, error } = await supabase.rpc(FN.submitDataConfirmation, {
      p_org_id: ORG_ID,
      p_reference_code: `${prefixFor(form.data.academicYear.label)}${parsed.data.reference_number}`,
      p_contact_no: parsed.data.contact_no,
      p_note: parsed.data.note,
      p_has_changes: hasChanges,
    });
    if (error) return { ok: false, error: friendlyPublicError(error.message) };
    return { ok: true, data: { id: data as string } };
  } catch (e) {
    return { ok: false, error: message(e) };
  }
}

function friendlyPublicError(raw: string) {
  // Postgres wraps our RAISE EXCEPTION text; strip its own prefix if present.
  return raw.replace(/^.*?ERROR:\s*/i, "").trim() || "Something went wrong. Please try again.";
}
