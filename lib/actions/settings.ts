"use server";

import { requireUser } from "@/lib/supabase/server";
import { ORG_ID } from "@/lib/constants";
import { CONFIG_TABLES, T } from "@/lib/tables";
import { writeAudit } from "@/lib/audit";
import { deleteEntity, friendly, message, saveEntity } from "@/lib/actions/crud";
import { clearBandAwards } from "@/lib/actions/award-assignment";
import {
  academicYearSchema,
  awardCategorySchema,
  boardSchema,
  courseSchema,
  giftItemSchema,
  institutionSchema,
  mediumSchema,
  standardSchema,
  streamSchema,
} from "@/lib/validators";
import type { ActionResult, ModuleName } from "@/lib/types";

/** Table name → schema. Adding a new config entity means one line here plus a UI tab. */
const REGISTRY = {
  academic_years: academicYearSchema,
  boards: boardSchema,
  mediums: mediumSchema,
  courses: courseSchema,
  standards: standardSchema,
  streams: streamSchema,
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
  streams: ["/settings", "/students", "/academic-records", "/awards", "/reports"],
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

/** A Course or Standard is `on delete set null` on am_academic_records — but
 *  am_academic_records_placement_ck requires every record to keep *some*
 *  placement (standard_id or course_id, never neither), so deleting one
 *  while a record's *only* placement actually fails outright with a
 *  constraint error, rather than silently blanking it. That still leaves one
 *  real gap: a record that happens to carry both (data from before this rule
 *  existed, say) loses just the one being deleted and keeps the other,
 *  quietly changing which rule governs it — so any rank/consolation award it
 *  had is cleared too, once the delete is confirmed to have gone through
 *  (never before: clearing an award for a delete that then fails would wipe
 *  it for nothing). See lib/actions/award-assignment.ts's "No course/standard
 *  set" skip entries for how staff are shown anything this still misses. */
const PLACEMENT_COLUMN: Partial<Record<ConfigTable, "course_id" | "standard_id">> = {
  courses: "course_id",
  standards: "standard_id",
};

export async function deleteConfig(
  entity: ConfigTable,
  id: string,
): Promise<ActionResult<null>> {
  if (!REGISTRY[entity]) return { ok: false, error: "Unknown configuration table" };

  const placementColumn = PLACEMENT_COLUMN[entity];
  let affectedRecordIds: string[] = [];
  if (placementColumn) {
    const { supabase } = await requireUser();
    const { data: affected } = await supabase.from(T.academicRecords).select("id").eq(placementColumn, id);
    affectedRecordIds = (affected ?? []).map((r) => r.id as string);
  }

  const result = await deleteEntity({
    table: CONFIG_TABLES[entity],
    entity,
    module: CONFIG_MODULE[entity],
    id,
    revalidate: REVALIDATE[entity],
  });
  if (!result.ok) return result;

  if (affectedRecordIds.length > 0) {
    try {
      const { supabase, actor } = await requireUser();
      await clearBandAwards(supabase, actor, affectedRecordIds);
    } catch (e) {
      // The course/standard is already gone — a cleanup failure here
      // shouldn't be reported as the delete itself having failed.
      console.error("[deleteConfig] clearBandAwards failed after delete:", message(e));
    }
  }

  return result;
}

/** Which module's Delete permission each config entity falls under — mirrors
 *  the table→module mapping the RLS policies use (0022). Streams have no
 *  RLS gating of their own, so they follow the rest of Settings. */
const CONFIG_MODULE: Record<ConfigTable, ModuleName> = {
  academic_years: "settings",
  boards: "settings",
  mediums: "settings",
  courses: "settings",
  standards: "settings",
  streams: "settings",
  award_categories: "settings",
  gift_items: "gifts",
  institutions: "institutions",
};

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
