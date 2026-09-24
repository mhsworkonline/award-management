"use server";

import { revalidatePath } from "next/cache";
import { requirePermission, createClient } from "@/lib/supabase/server";
import { ORG_ID } from "@/lib/constants";
import { buildDiff, writeAudit } from "@/lib/audit";
import { friendly, message, NOTHING_DELETED } from "@/lib/actions/crud";
import { FN, T } from "@/lib/tables";
import type { ActionResult, PublicSubmissionRow } from "@/lib/types";

/** Clicking a confirmation opens the *exact* Review Application sheet
 *  /submissions already uses (see am_get_submission_by_record, 0043) — a
 *  confirmation always traces back to the approved submission that created
 *  its academic record, and that sheet already knows how to edit an
 *  approved submission safely (pushing the correction into the linked
 *  student/academic record — see updateSubmission). There's at most one:
 *  academic_record_id is only ever set once, at approval. */
export async function getConfirmationSubmission(
  academicRecordId: string,
): Promise<ActionResult<PublicSubmissionRow | null>> {
  try {
    const supabase = createClient();
    const { data, error } = await supabase.rpc(FN.getSubmissionByRecord, {
      p_org_id: ORG_ID,
      p_academic_record_id: academicRecordId,
    });
    if (error) return { ok: false, error: friendly(error.message) };
    return { ok: true, data: (data as PublicSubmissionRow | null) ?? null };
  } catch (e) {
    return { ok: false, error: message(e) };
  }
}

/** Staff clearing a confirmation/correction once it's been read and acted
 *  on. Gated on Confirmations:Delete. `.select("id")` re-confirms a row was
 *  actually removed — RLS deletes zero rows without an error when it blocks
 *  one. */
export async function deleteDataConfirmation(id: string): Promise<ActionResult<null>> {
  try {
    const { supabase, actor } = await requirePermission("confirmations", "delete");

    const { data: before } = await supabase.from(T.dataConfirmations).select("*").eq("id", id).maybeSingle();
    if (!before) return { ok: false, error: "Not found" };

    const { data: removed, error } = await supabase
      .from(T.dataConfirmations)
      .delete()
      .eq("id", id)
      .select("id");
    if (error) return { ok: false, error: friendly(error.message) };
    if (!removed?.length) return { ok: false, error: NOTHING_DELETED };

    await writeAudit(supabase, {
      entity: "data_confirmations",
      entityId: id,
      action: "delete",
      actor,
      diff: buildDiff(before, null),
    });

    revalidatePath("/confirmations");
    return { ok: true, data: null };
  } catch (e) {
    return { ok: false, error: message(e) };
  }
}
