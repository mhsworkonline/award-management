"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/supabase/server";
import { ORG_ID } from "@/lib/constants";
import { buildDiff, writeAudit } from "@/lib/audit";
import { friendly, message } from "@/lib/actions/crud";
import { giftAllocationSchema, studentAwardSchema } from "@/lib/validators";
import type { ActionResult } from "@/lib/types";
import { T, FN } from "@/lib/tables";

export async function saveAward(raw: unknown): Promise<ActionResult<{ id: string }>> {
  const parsed = studentAwardSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      error: "Please correct the highlighted fields",
      fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
    };
  }

  const { id, ...values } = parsed.data;

  try {
    const { supabase, actor } = await requireUser();

    if (id) {
      const { data: before } = await supabase.from(T.studentAwards).select("*").eq("id", id).single();
      const { data, error } = await supabase
        .from(T.studentAwards)
        .update(values)
        .eq("id", id)
        .eq("org_id", ORG_ID)
        .select()
        .single();
      if (error) return { ok: false, error: friendly(error.message) };

      await writeAudit(supabase, {
        entity: "student_awards",
        entityId: id,
        action: "update",
        actor,
        diff: buildDiff(before ?? null, data),
      });
      revalidateAward();
      return { ok: true, data: { id } };
    }

    const { data, error } = await supabase
      .from(T.studentAwards)
      .insert({ ...values, org_id: ORG_ID })
      .select()
      .single();
    if (error) {
      return {
        ok: false,
        error: error.message.includes("duplicate key")
          ? "This student already holds that award category for this enrollment"
          : friendly(error.message),
      };
    }

    await writeAudit(supabase, {
      entity: "student_awards",
      entityId: data.id,
      action: "create",
      actor,
      diff: buildDiff(null, data),
    });
    revalidateAward();
    return { ok: true, data: { id: data.id as string } };
  } catch (e) {
    return { ok: false, error: message(e) };
  }
}

export async function deleteAward(id: string): Promise<ActionResult<null>> {
  try {
    const { supabase, actor } = await requireUser();
    const { data: before } = await supabase.from(T.studentAwards).select("*").eq("id", id).single();

    const { error } = await supabase
      .from(T.studentAwards)
      .delete()
      .eq("id", id)
      .eq("org_id", ORG_ID);
    if (error) return { ok: false, error: friendly(error.message) };

    await writeAudit(supabase, {
      entity: "student_awards",
      entityId: id,
      action: "delete",
      actor,
      diff: buildDiff(before ?? null, null),
    });
    revalidateAward();
    return { ok: true, data: null };
  } catch (e) {
    return { ok: false, error: message(e) };
  }
}

/** Stock check, insert and decrement happen inside one Postgres function so two
 *  operators cannot oversubscribe the same gift item. */
export async function allocateGift(raw: unknown): Promise<ActionResult<{ id: string }>> {
  const parsed = giftAllocationSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      error: "Please correct the highlighted fields",
      fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
    };
  }

  try {
    const { supabase, actor } = await requireUser();

    const { data, error } = await supabase.rpc(FN.allocateGift, {
      p_org_id: ORG_ID,
      p_student_award_id: parsed.data.student_award_id,
      p_gift_item_id: parsed.data.gift_item_id,
      p_quantity: parsed.data.quantity,
    });

    if (error) {
      return {
        ok: false,
        error: error.message.includes("duplicate key")
          ? "That gift is already allocated to this award"
          : friendly(error.message),
      };
    }

    await writeAudit(supabase, {
      entity: "gift_allocations",
      entityId: data as string,
      action: "create",
      actor,
      diff: { allocated: parsed.data },
    });

    revalidateAward();
    return { ok: true, data: { id: data as string } };
  } catch (e) {
    return { ok: false, error: message(e) };
  }
}

/** Deleting an allocation restores stock via trigger. */
export async function deallocateGift(id: string): Promise<ActionResult<null>> {
  try {
    const { supabase, actor } = await requireUser();
    const { data: before } = await supabase
      .from(T.giftAllocations)
      .select("*")
      .eq("id", id)
      .single();

    const { error } = await supabase
      .from(T.giftAllocations)
      .delete()
      .eq("id", id)
      .eq("org_id", ORG_ID);
    if (error) return { ok: false, error: friendly(error.message) };

    await writeAudit(supabase, {
      entity: "gift_allocations",
      entityId: id,
      action: "delete",
      actor,
      diff: buildDiff(before ?? null, null),
    });
    revalidateAward();
    return { ok: true, data: null };
  } catch (e) {
    return { ok: false, error: message(e) };
  }
}

/** Shortcut for the "suggested top performers" panel: assign a category
 *  directly from a ranked academic record without opening the full picker. */
export async function quickAssignAward(input: {
  academic_record_id: string;
  award_category_id: string;
}): Promise<ActionResult<{ id: string }>> {
  return saveAward({
    academic_record_id: input.academic_record_id,
    award_category_id: input.award_category_id,
  });
}

function revalidateAward() {
  revalidatePath("/awards");
  revalidatePath("/distribution");
  revalidatePath("/gifts");
  revalidatePath("/dashboard");
  revalidatePath("/reports");
}
