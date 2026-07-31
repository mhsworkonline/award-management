"use server";

import { requireUser } from "@/lib/supabase/server";
import { ORG_ID } from "@/lib/constants";
import { CONFIG_TABLES, T } from "@/lib/tables";
import { writeAudit } from "@/lib/audit";
import { deleteEntity, friendly, message, saveEntity } from "@/lib/actions/crud";
import {
  academicYearSchema,
  awardCategorySchema,
  boardSchema,
  courseSchema,
  giftItemSchema,
  institutionSchema,
  mediumSchema,
  standardSchema,
} from "@/lib/validators";
import type { ActionResult } from "@/lib/types";

/** Table name → schema. Adding a new config entity means one line here plus a UI tab. */
const REGISTRY = {
  academic_years: academicYearSchema,
  boards: boardSchema,
  mediums: mediumSchema,
  courses: courseSchema,
  standards: standardSchema,
  award_categories: awardCategorySchema,
  gift_items: giftItemSchema,
  institutions: institutionSchema,
} as const;

export type ConfigTable = keyof typeof REGISTRY;

const REVALIDATE: Record<ConfigTable, string[]> = {
  academic_years: ["/settings", "/dashboard", "/students", "/academic-records", "/reports"],
  boards: ["/settings", "/institutions", "/students"],
  mediums: ["/settings", "/institutions", "/students"],
  courses: ["/settings", "/students", "/academic-records"],
  standards: ["/settings", "/students", "/academic-records"],
  award_categories: ["/settings", "/awards", "/reports", "/distribution"],
  gift_items: ["/settings", "/gifts", "/awards", "/distribution"],
  institutions: ["/institutions", "/students", "/academic-records", "/dashboard", "/reports"],
};

export async function saveConfig(
  entity: ConfigTable,
  raw: unknown,
): Promise<ActionResult<{ id: string }>> {
  const schema = REGISTRY[entity];
  if (!schema) return { ok: false, error: "Unknown configuration table" };
  return saveEntity({
    table: CONFIG_TABLES[entity],
    entity,
    schema,
    raw,
    revalidate: REVALIDATE[entity],
  });
}

export async function deleteConfig(
  entity: ConfigTable,
  id: string,
): Promise<ActionResult<null>> {
  if (!REGISTRY[entity]) return { ok: false, error: "Unknown configuration table" };
  return deleteEntity({
    table: CONFIG_TABLES[entity],
    entity,
    id,
    revalidate: REVALIDATE[entity],
  });
}

/** Exactly one academic year is the active default. */
export async function setActiveYear(id: string): Promise<ActionResult<null>> {
  try {
    const { supabase, actor } = await requireUser();

    const clear = await supabase
      .from(T.academicYears)
      .update({ is_active: false })
      .eq("org_id", ORG_ID)
      .eq("is_active", true);
    if (clear.error) return { ok: false, error: friendly(clear.error.message) };

    const { error } = await supabase
      .from(T.academicYears)
      .update({ is_active: true })
      .eq("org_id", ORG_ID)
      .eq("id", id);
    if (error) return { ok: false, error: friendly(error.message) };

    await writeAudit(supabase, {
      entity: "academic_years",
      entityId: id,
      action: "update",
      actor,
      diff: { is_active: { from: false, to: true } },
    });

    return { ok: true, data: null };
  } catch (e) {
    return { ok: false, error: message(e) };
  }
}
