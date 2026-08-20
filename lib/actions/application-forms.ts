"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/supabase/server";
import { ORG_ID } from "@/lib/constants";
import { buildDiff, writeAudit } from "@/lib/audit";
import { friendly, message } from "@/lib/actions/crud";
import { applicationFormSchema } from "@/lib/validators";
import { T } from "@/lib/tables";
import type { ActionResult } from "@/lib/types";

function revalidateAll() {
  revalidatePath("/forms");
  revalidatePath("/apply");
}

export async function saveApplicationForm(raw: unknown): Promise<ActionResult<{ id: string }>> {
  const parsed = applicationFormSchema.safeParse(raw);
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
      const { data: before } = await supabase.from(T.applicationForms).select("*").eq("id", id).single();
      const { data, error } = await supabase
        .from(T.applicationForms)
        .update(values)
        .eq("id", id)
        .eq("org_id", ORG_ID)
        .select()
        .single();
      if (error) {
        return {
          ok: false,
          error: error.message.includes("duplicate key") ? "That slug is already in use" : friendly(error.message),
        };
      }
      await writeAudit(supabase, {
        entity: "application_forms",
        entityId: id,
        action: "update",
        actor,
        diff: buildDiff(before ?? null, data),
      });
      revalidateAll();
      return { ok: true, data: { id } };
    }

    const { data, error } = await supabase
      .from(T.applicationForms)
      .insert({ ...values, org_id: ORG_ID, created_by: actor })
      .select()
      .single();
    if (error) {
      return {
        ok: false,
        error: error.message.includes("duplicate key") ? "That slug is already in use" : friendly(error.message),
      };
    }

    await writeAudit(supabase, {
      entity: "application_forms",
      entityId: data.id,
      action: "create",
      actor,
      diff: buildDiff(null, data),
    });
    revalidateAll();
    return { ok: true, data: { id: data.id as string } };
  } catch (e) {
    return { ok: false, error: message(e) };
  }
}

export async function toggleApplicationForm(id: string, enabled: boolean): Promise<ActionResult<null>> {
  try {
    const { supabase, actor } = await requireUser();
    const { error } = await supabase
      .from(T.applicationForms)
      .update({ is_enabled: enabled })
      .eq("id", id)
      .eq("org_id", ORG_ID);
    if (error) return { ok: false, error: friendly(error.message) };

    await writeAudit(supabase, {
      entity: "application_forms",
      entityId: id,
      action: "update",
      actor,
      diff: { is_enabled: { to: enabled } },
    });
    revalidateAll();
    return { ok: true, data: null };
  } catch (e) {
    return { ok: false, error: message(e) };
  }
}

export async function deleteApplicationForm(id: string): Promise<ActionResult<null>> {
  try {
    const { supabase, actor } = await requireUser();
    const { data: before } = await supabase.from(T.applicationForms).select("*").eq("id", id).single();

    const { error } = await supabase.from(T.applicationForms).delete().eq("id", id).eq("org_id", ORG_ID);
    if (error) return { ok: false, error: friendly(error.message) };

    await writeAudit(supabase, {
      entity: "application_forms",
      entityId: id,
      action: "delete",
      actor,
      diff: buildDiff(before ?? null, null),
    });
    revalidateAll();
    return { ok: true, data: null };
  } catch (e) {
    return { ok: false, error: message(e) };
  }
}
