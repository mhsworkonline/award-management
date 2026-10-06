"use server";

import { revalidatePath } from "next/cache";
import { requirePermission, requireUser } from "@/lib/supabase/server";
import { ORG_ID } from "@/lib/constants";
import { buildDiff, writeAudit } from "@/lib/audit";
import { friendly, message, NOTHING_DELETED } from "@/lib/actions/crud";
import { academicRecordSchema, gradeEntrySchema } from "@/lib/validators";
import { listRosterForGrading } from "@/lib/data/academic-records";
import { clearBandAwards } from "@/lib/actions/award-assignment";
import { T } from "@/lib/tables";
import type { ActionResult } from "@/lib/types";

/** Fields that decide which Assign Awards band a record falls into (see
 *  lib/awards/percentage-rule.ts and lib/awards/college-rank-rule.ts) — a
 *  change to any of these can make an existing rank/consolation award wrong,
 *  so saveAcademicRecord clears it rather than leave a stale one in place. */
const BAND_AFFECTING_FIELDS = ["standard_id", "course_id", "period_no", "percentage", "grade"] as const;

export type RosterEntry = Awaited<ReturnType<typeof listRosterForGrading>>[number];

/** Client-driven scope picker (institution + year + standard/course) loads its
 *  roster through this action rather than a route, since it's a same-origin
 *  read gated by the same auth check as every other action. */
export async function fetchRosterForGrading(input: {
  institution_id: string;
  academic_year_id: string;
  standard_id?: string;
  stream_id?: string;
  course_id?: string;
  period_no?: number;
}): Promise<ActionResult<RosterEntry[]>> {
  try {
    await requireUser();
    const rows = await listRosterForGrading(input);
    return { ok: true, data: rows };
  } catch (e) {
    return { ok: false, error: message(e) };
  }
}

function revalidateRecords() {
  revalidatePath("/students");
  revalidatePath("/academic-records");
  revalidatePath("/awards");
  revalidatePath("/dashboard");
  revalidatePath("/reports");
}

/** Enroll an existing student into another institution/year (promotion,
 *  transfer, or simply "already in the system, add this year"), or edit an
 *  existing enrollment's placement/grade in one form. */
export async function saveAcademicRecord(raw: unknown): Promise<ActionResult<{ id: string }>> {
  const parsed = academicRecordSchema.safeParse(raw);
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
      const { data: before } = await supabase.from(T.academicRecords).select("*").eq("id", id).single();
      const { data, error } = await supabase
        .from(T.academicRecords)
        .update(values)
        .eq("id", id)
        .eq("org_id", ORG_ID)
        .select()
        .single();
      if (error) return { ok: false, error: friendly(error.message) };

      await writeAudit(supabase, {
        entity: "academic_records",
        entityId: id,
        action: "update",
        actor,
        diff: buildDiff(before ?? null, data),
      });

      const bandAffectingChange = BAND_AFFECTING_FIELDS.some((field) => before && before[field] !== data[field]);
      if (bandAffectingChange) await clearBandAwards(supabase, actor, [id]);

      revalidateRecords();
      return { ok: true, data: { id } };
    }

    const { data, error } = await supabase
      .from(T.academicRecords)
      .insert({ ...values, org_id: ORG_ID })
      .select()
      .single();
    if (error) {
      return {
        ok: false,
        error: error.message.includes("duplicate key")
          ? "This student already has this exact enrollment (same institution and course/standard) for that academic year"
          : friendly(error.message),
      };
    }

    await writeAudit(supabase, {
      entity: "academic_records",
      entityId: data.id,
      action: "create",
      actor,
      diff: buildDiff(null, data),
    });
    revalidateRecords();
    return { ok: true, data: { id: data.id as string } };
  } catch (e) {
    return { ok: false, error: message(e) };
  }
}

export async function deleteAcademicRecord(id: string): Promise<ActionResult<null>> {
  try {
    const { supabase, actor } = await requirePermission("academic_records", "delete");
    const { data: before } = await supabase.from(T.academicRecords).select("*").eq("id", id).single();

    const { data: removed, error } = await supabase
      .from(T.academicRecords)
      .delete()
      .eq("id", id)
      .eq("org_id", ORG_ID)
      .select("id");
    if (error) return { ok: false, error: friendly(error.message) };
    if (!removed?.length) return { ok: false, error: NOTHING_DELETED };

    await writeAudit(supabase, {
      entity: "academic_records",
      entityId: id,
      action: "delete",
      actor,
      diff: buildDiff(before ?? null, null),
    });
    revalidateRecords();
    return { ok: true, data: null };
  } catch (e) {
    return { ok: false, error: message(e) };
  }
}

/** Bulk grade entry — a whole class's percentage/grade/rank saved in one pass
 *  from the roster table. Each row is validated independently; one bad row
 *  doesn't block the rest. */
export async function saveGrades(
  entries: unknown[],
): Promise<ActionResult<{ saved: number; failed: number }>> {
  try {
    const { supabase, actor } = await requireUser();

    // Percentage/grade feed straight into Assign Awards' bands, so a bulk
    // correction here needs the same stale-award clearing saveAcademicRecord
    // does — fetched up front as one query rather than once per row.
    const parsedEntries = entries
      .map((raw) => gradeEntrySchema.safeParse(raw))
      .filter((p): p is Extract<typeof p, { success: true }> => p.success);
    const ids = parsedEntries.map((p) => p.data.id);
    const { data: beforeRows } = ids.length
      ? await supabase.from(T.academicRecords).select("id, percentage, grade").in("id", ids)
      : { data: [] as { id: string; percentage: number | null; grade: string | null }[] };
    const beforeById = new Map((beforeRows ?? []).map((r) => [r.id, r]));

    let saved = 0;
    let failed = entries.length - parsedEntries.length;
    const bandAffectedIds: string[] = [];

    for (const parsed of parsedEntries) {
      const { id, ...values } = parsed.data;
      const { error } = await supabase
        .from(T.academicRecords)
        .update(values)
        .eq("id", id)
        .eq("org_id", ORG_ID);

      if (error) {
        failed += 1;
        continue;
      }
      saved += 1;
      const before = beforeById.get(id);
      if (before && (before.percentage !== values.percentage || before.grade !== values.grade)) {
        bandAffectedIds.push(id);
      }
    }

    if (bandAffectedIds.length > 0) await clearBandAwards(supabase, actor, bandAffectedIds);

    await writeAudit(supabase, {
      entity: "academic_records",
      entityId: null,
      action: "update",
      actor,
      diff: { bulk_grade_entry: { saved, failed } },
    });

    revalidateRecords();
    return { ok: true, data: { saved, failed } };
  } catch (e) {
    return { ok: false, error: message(e) };
  }
}
