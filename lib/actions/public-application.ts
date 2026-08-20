"use server";

import { createHash } from "node:crypto";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { ORG_ID } from "@/lib/constants";
import { publicApplicationSchema } from "@/lib/validators";
import { FN } from "@/lib/tables";
import { message } from "@/lib/actions/crud";
import type { ActionResult, PublicFormOptions, ResolvedForm } from "@/lib/types";

/** Unauthenticated — resolves which form /apply (or /apply/[slug]) should
 *  render. No slug = the org's current default (active-year form, else most
 *  recently created enabled one). */
export async function resolveApplicationForm(slug?: string): Promise<ActionResult<ResolvedForm>> {
  try {
    const supabase = createClient();
    const { data, error } = await supabase.rpc(FN.resolveApplicationForm, {
      p_org_id: ORG_ID,
      p_slug: slug ?? null,
    });
    if (error) return { ok: false, error: error.message };
    return { ok: true, data: data as ResolvedForm };
  } catch (e) {
    return { ok: false, error: message(e) };
  }
}

/** Unauthenticated — powers the /apply page's dropdowns via a security-definer
 *  RPC that exposes only safe columns from institutions/boards/standards/courses. */
export async function getPublicFormOptions(): Promise<ActionResult<PublicFormOptions>> {
  try {
    const supabase = createClient();
    const { data, error } = await supabase.rpc(FN.publicFormOptions, { p_org_id: ORG_ID });
    if (error) return { ok: false, error: error.message };
    return { ok: true, data: data as PublicFormOptions };
  } catch (e) {
    return { ok: false, error: message(e) };
  }
}

/** A rough per-device fingerprint for rate limiting, not an identity — the raw
 *  IP is never stored, only a salted hash of it. */
function ipHash() {
  try {
    const h = headers();
    const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "unknown";
    return createHash("sha256").update(`am-apply-salt:${ip}`).digest("hex").slice(0, 32);
  } catch {
    return null;
  }
}

/** Unauthenticated submit for the public /apply form. Writes go exclusively
 *  through am_submit_public_application (SECURITY DEFINER) — there is no RLS
 *  policy letting anon insert into am_public_submissions directly. Returns the
 *  reference code the applicant is told to keep for follow-up. */
export async function submitPublicApplication(
  formId: string,
  raw: unknown,
): Promise<ActionResult<{ id: string; referenceCode: string }>> {
  const parsed = publicApplicationSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      error: "Please correct the highlighted fields",
      fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
    };
  }

  // Honeypot tripped — pretend success so the bot doesn't learn it was caught.
  if (parsed.data.website) {
    return { ok: true, data: { id: "00000000-0000-0000-0000-000000000000", referenceCode: "AWD-000000" } };
  }

  try {
    const supabase = createClient();
    const { data, error } = await supabase.rpc(FN.submitPublicApplication, {
      p_org_id: ORG_ID,
      p_form_id: formId,
      p_salutation: parsed.data.salutation,
      p_first_name: parsed.data.first_name,
      p_middle_name: parsed.data.middle_name,
      p_last_name: parsed.data.last_name,
      p_email: parsed.data.email,
      p_contact_no: parsed.data.contact_no,
      p_institution_id: parsed.data.institution_id,
      p_other_institution_name: parsed.data.other_institution_name,
      p_board_id: parsed.data.board_id,
      p_other_board_name: parsed.data.other_board_name,
      p_medium_id: parsed.data.medium_id,
      p_standard_id: parsed.data.standard_id,
      p_course_id: parsed.data.course_id,
      p_other_course_name: parsed.data.other_course_name,
      p_other_course_structure: parsed.data.other_course_structure,
      p_period_no: parsed.data.period_no,
      p_roll_no: parsed.data.roll_no,
      p_percentage: parsed.data.percentage,
      p_grade: parsed.data.grade,
      p_notes: parsed.data.notes,
      p_ip_hash: ipHash(),
    });

    if (error) return { ok: false, error: friendlyPublicError(error.message) };
    const result = data as { id: string; reference_code: string };
    return { ok: true, data: { id: result.id, referenceCode: result.reference_code } };
  } catch (e) {
    return { ok: false, error: message(e) };
  }
}

/** Records an attachment's metadata after the file itself has already been
 *  uploaded client-side to Storage (anon can write objects but never insert
 *  metadata rows directly — this RPC is the only door in, and re-validates
 *  count/size/type server-side regardless of what the client already checked). */
export async function registerAttachment(input: {
  submissionId: string;
  filePath: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
}): Promise<ActionResult<{ id: string }>> {
  try {
    const supabase = createClient();
    const { data, error } = await supabase.rpc(FN.registerAttachment, {
      p_org_id: ORG_ID,
      p_submission_id: input.submissionId,
      p_file_path: input.filePath,
      p_file_name: input.fileName,
      p_mime_type: input.mimeType,
      p_size_bytes: input.sizeBytes,
    });
    if (error) return { ok: false, error: friendlyPublicError(error.message) };
    return { ok: true, data: { id: data as string } };
  } catch (e) {
    return { ok: false, error: message(e) };
  }
}

function friendlyPublicError(raw: string) {
  // Postgres wraps our RAISE EXCEPTION text; strip its own prefix if present.
  return raw.replace(/^.*?ERROR:\s*/i, "").trim() || "Could not submit. Please try again.";
}
