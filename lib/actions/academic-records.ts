"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/supabase/server";
import { ORG_ID } from "@/lib/constants";
import { buildDiff, writeAudit } from "@/lib/audit";
import { friendly, message } from "@/lib/actions/crud";
import { academicRecordSchema, gradeEntrySchema } from "@/lib/validators";
import { listRosterForGrading } from "@/lib/data/academic-records";
import { T } from "@/lib/tables";
import type { ActionResult } from "@/lib/types";

export type RosterEntry = Awaited<ReturnType<typeof listRosterForGrading>>[number];

/** Client-driven scope picker (institution + year + standard/course) loads its
 *  roster through this action rather than a route, since it's a same-origin
 *  read gated by the same auth check as every other action. */
export async function fetchRosterForGrading(input: {
  institution_id: string;
  academic_year_id: string;
  standard_id?: string;
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
          ? "This student already has a record for that academic year"
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
    const { supabase, actor } = await requireUser();
    const { data: before } = await supabase.from(T.academicRecords).select("*").eq("id", id).single();

    const { error } = await supabase
      .from(T.academicRecords)
      .delete()
      .eq("id", id)
      .eq("org_id", ORG_ID);
    if (error) return { ok: false, error: friendly(error.message) };

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

    let saved = 0;
    let failed = 0;

    for (const raw of entries) {
      const parsed = gradeEntrySchema.safeParse(raw);
      if (!parsed.success) {
        failed += 1;
        continue;
      }

      const { id, ...values } = parsed.data;
      const { error } = await supabase
        .from(T.academicRecords)
        .update(values)
        .eq("id", id)
        .eq("org_id", ORG_ID);

      if (error) failed += 1;
      else saved += 1;
    }

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
