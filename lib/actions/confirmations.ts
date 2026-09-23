"use server";

import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/supabase/server";
import { buildDiff, writeAudit } from "@/lib/audit";
import { friendly, message, NOTHING_DELETED } from "@/lib/actions/crud";
import { T } from "@/lib/tables";
import type { ActionResult } from "@/lib/types";

/** Staff clearing a confirmation/correction once it's been read and acted
 *  on. Gated on Submissions:Delete — same module the whole /confirmations
 *  surface piggybacks on (see 0040's comment for why there's no dedicated
 *  module). `.select("id")` re-confirms a row was actually removed —
 *  RLS deletes zero rows without an error when it blocks one. */
export async function deleteDataConfirmation(id: string): Promise<ActionResult<null>> {
  try {
    const { supabase, actor } = await requirePermission("submissions", "delete");

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
