"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/supabase/server";
import { ORG_ID } from "@/lib/constants";
import { writeAudit } from "@/lib/audit";
import { friendly, message } from "@/lib/actions/crud";
import type { ActionResult, DistributionStatus } from "@/lib/types";
import { T } from "@/lib/tables";

/** Online path. The offline path goes through /api/distribution/sync instead,
 *  but both converge on the same row shape and audit trail. */
export async function setDistributionStatus(input: {
  id: string;
  status: DistributionStatus;
}): Promise<ActionResult<null>> {
  try {
    const { supabase, actor } = await requireUser();

    const distributed = input.status === "distributed";
    const { error } = await supabase
      .from(T.distributionRecords)
      .update({
        status: input.status,
        distributed_at: distributed ? new Date().toISOString() : null,
        distributed_by: distributed ? actor : null,
        sync_status: "synced",
      })
      .eq("id", input.id)
      .eq("org_id", ORG_ID);

    if (error) return { ok: false, error: friendly(error.message) };

    await writeAudit(supabase, {
      entity: "distribution_records",
      entityId: input.id,
      action: "update",
      actor,
      diff: { status: { to: input.status }, source: "online" },
    });

    revalidatePath("/distribution");
    revalidatePath("/dashboard");
    return { ok: true, data: null };
  } catch (e) {
    return { ok: false, error: message(e) };
  }
}
