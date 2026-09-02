"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/supabase/server";
import { ORG_ID } from "@/lib/constants";
import { buildDiff, writeAudit } from "@/lib/audit";
import { friendly, message } from "@/lib/actions/crud";
import { studentSchema, academicRecordSchema } from "@/lib/validators";
import { findDuplicateStudents } from "@/lib/data/students";
import { normalizeName } from "@/lib/utils";
import { T } from "@/lib/tables";
import type { ActionResult } from "@/lib/types";

export type DuplicateMatch = {
  id: string;
  name: string;
  enrollments: string[]; // "Institution — Year" summaries, for context
};

/** Called from the Add Student page before saving. Persistent-identity match —
 *  a warning, never a hard block, since genuine namesakes exist. */
export async function checkDuplicateStudents(input: {
  first_name: string;
  middle_name?: string | null;
  last_name: string;
  excludeId?: string;
}): Promise<ActionResult<DuplicateMatch[]>> {
  try {
    await requireUser();
    if (!input.first_name?.trim() || !input.last_name?.trim()) return { ok: true, data: [] };

    const rows = await findDuplicateStudents(input);

    return {
      ok: true,
      data: rows.map((r) => ({
        id: r.id,
        name: [r.first_name, r.middle_name, r.last_name].filter(Boolean).join(" "),
        enrollments: (
          (r as unknown as {
            academic_records?: {
              institutions?: { name: string } | null;
              academic_years?: { label: string } | null;
            }[];
          }).academic_records ?? []
        ).map((e) => `${e.institutions?.name ?? "—"} — ${e.academic_years?.label ?? "—"}`),
      })),
    };
  } catch (e) {
    return { ok: false, error: message(e) };
  }
}

/** Identity-only save — name and contact details. Enrollment (institution,
 *  year, standard, grade) is edited via the academic-records actions. */
export async function saveStudent(raw: unknown): Promise<ActionResult<{ id: string }>> {
  const parsed = studentSchema.safeParse(raw);
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
      const { data: before } = await supabase.from(T.students).select("*").eq("id", id).single();
      const { data, error } = await supabase
        .from(T.students)
        .update(values)
        .eq("id", id)
        .eq("org_id", ORG_ID)
        .select()
        .single();
      if (error) return { ok: false, error: friendly(error.message) };

      await writeAudit(supabase, {
        entity: "students",
        entityId: id,
        action: "update",
        actor,
        diff: buildDiff(before ?? null, data),
      });
      revalidatePath("/students");
      revalidatePath("/awards");
      return { ok: true, data: { id } };
    }

    const { data, error } = await supabase
      .from(T.students)
      .insert({ ...values, org_id: ORG_ID })
      .select()
      .single();
    if (error) return { ok: false, error: friendly(error.message) };

    await writeAudit(supabase, {
      entity: "students",
      entityId: data.id,
      action: "create",
      actor,
      diff: buildDiff(null, data),
    });
    revalidatePath("/students");
    revalidatePath("/dashboard");
    return { ok: true, data: { id: data.id as string } };
  } catch (e) {
    return { ok: false, error: message(e) };
  }
}

export async function deleteStudent(id: string): Promise<ActionResult<null>> {
  try {
    const { supabase, actor } = await requireUser();
    const { data: before } = await supabase.from(T.students).select("*").eq("id", id).single();

    const { error } = await supabase.from(T.students).delete().eq("id", id).eq("org_id", ORG_ID);
    if (error) return { ok: false, error: friendly(error.message) };

    await writeAudit(supabase, {
      entity: "students",
      entityId: id,
      action: "delete",
      actor,
      diff: buildDiff(before ?? null, null),
    });
    revalidatePath("/students");
    revalidatePath("/dashboard");
    return { ok: true, data: null };
  } catch (e) {
    return { ok: false, error: message(e) };
  }
}

/** The full-page "Add Student" flow: create the persistent identity and this
 *  year's enrollment together, as one unit from the operator's point of view. */
export async function createStudentWithRecord(input: {
  salutation?: string | null;
  first_name: string;
  middle_name?: string | null;
  last_name: string;
  lanedaar_name?: string | null;
  email?: string | null;
  contact_no?: string | null;
  photo_path: string;
  remarks?: string | null;
  institution_id: string;
  academic_year_id: string;
  standard_id?: string | null;
  course_id?: string | null;
  period_no?: number | null;
  roll_no?: string | null;
  percentage?: number | null;
  grade?: string | null;
  rank?: number | null;
}): Promise<ActionResult<{ studentId: string; recordId: string }>> {
  const studentParsed = studentSchema.safeParse({
    salutation: input.salutation,
    first_name: input.first_name,
    middle_name: input.middle_name,
    last_name: input.last_name,
    lanedaar_name: input.lanedaar_name,
    email: input.email,
    contact_no: input.contact_no,
    photo_path: input.photo_path,
    remarks: input.remarks,
  });
  if (!studentParsed.success) {
    return {
      ok: false,
      error: "Please correct the highlighted fields",
      fieldErrors: studentParsed.error.flatten().fieldErrors as Record<string, string[]>,
    };
  }

  const recordParsed = academicRecordSchema.safeParse({
    student_id: "00000000-0000-0000-0000-000000000000", // placeholder, filled after student insert
    academic_year_id: input.academic_year_id,
    institution_id: input.institution_id,
    standard_id: input.standard_id,
    course_id: input.course_id,
    period_no: input.period_no,
    roll_no: input.roll_no,
    percentage: input.percentage,
    grade: input.grade,
    rank: input.rank,
  });
  if (!recordParsed.success) {
    return {
      ok: false,
      error: "Please correct the highlighted fields",
      fieldErrors: recordParsed.error.flatten().fieldErrors as Record<string, string[]>,
    };
  }

  try {
    const { supabase, actor } = await requireUser();

    const { data: student, error: studentError } = await supabase
      .from(T.students)
      .insert({ ...studentParsed.data, org_id: ORG_ID })
      .select()
      .single();
    if (studentError) return { ok: false, error: friendly(studentError.message) };

    const { student_id: _placeholder, ...recordValues } = recordParsed.data;
    const { data: record, error: recordError } = await supabase
      .from(T.academicRecords)
      .insert({ ...recordValues, student_id: student.id, org_id: ORG_ID })
      .select()
      .single();

    if (recordError) {
      // Roll back the orphaned student so a failed enrollment doesn't leave a
      // dangling identity with no record.
      await supabase.from(T.students).delete().eq("id", student.id);
      return { ok: false, error: friendly(recordError.message) };
    }

    await writeAudit(supabase, {
      entity: "students",
      entityId: student.id,
      action: "create",
      actor,
      diff: buildDiff(null, student),
    });
    await writeAudit(supabase, {
      entity: "academic_records",
      entityId: record.id,
      action: "create",
      actor,
      diff: buildDiff(null, record),
    });

    revalidatePath("/students");
    revalidatePath("/academic-records");
    revalidatePath("/dashboard");
    return { ok: true, data: { studentId: student.id, recordId: record.id } };
  } catch (e) {
    return { ok: false, error: message(e) };
  }
}

export type ImportRow = {
  rowNumber: number;
  first_name: string;
  middle_name: string | null;
  last_name: string;
  roll_no: string | null;
  contact_no: string | null;
  standard_id: string | null;
  course_id: string | null;
  period_no: number | null;
  errors: string[];
};

/** Commits a validated import batch: finds-or-creates the persistent student by
 *  name match, then creates their enrollment for the chosen institution/year.
 *  Rows the operator unchecked never arrive here. */
export async function commitImport(input: {
  institution_id: string;
  academic_year_id: string;
  rows: {
    first_name: string;
    middle_name: string | null;
    last_name: string;
    roll_no: string | null;
    contact_no: string | null;
    standard_id: string | null;
    course_id: string | null;
    period_no: number | null;
  }[];
}): Promise<ActionResult<{ inserted: number; matched: number }>> {
  try {
    const { supabase, actor } = await requireUser();

    if (!input.rows.length) return { ok: false, error: "No rows selected for import" };

    // Pull every existing student once, match in memory — cheaper than one
    // query per row for typical sheet sizes (hundreds, not tens of thousands).
    const existing = await supabase
      .from(T.students)
      .select("id, first_name, middle_name, last_name")
      .eq("org_id", ORG_ID)
      .limit(50000);

    const byKey = new Map<string, string>();
    for (const s of existing.data ?? []) {
      byKey.set(`${normalizeName(s.first_name)}|${normalizeName(s.middle_name)}|${normalizeName(s.last_name)}`, s.id);
    }

    let inserted = 0;
    let matched = 0;
    const recordPayload: Record<string, unknown>[] = [];

    for (const row of input.rows) {
      const key = `${normalizeName(row.first_name)}|${normalizeName(row.middle_name)}|${normalizeName(row.last_name)}`;
      let studentId = byKey.get(key);

      if (!studentId) {
        const { data: newStudent, error } = await supabase
          .from(T.students)
          .insert({
            org_id: ORG_ID,
            first_name: row.first_name,
            middle_name: row.middle_name,
            last_name: row.last_name,
            contact_no: row.contact_no,
          })
          .select("id")
          .single();
        if (error) {
          return { ok: false, error: `${friendly(error.message)} (stopped after ${inserted} rows)` };
        }
        studentId = newStudent.id as string;
        byKey.set(key, studentId);
        inserted += 1;
      } else {
        matched += 1;
      }

      recordPayload.push({
        org_id: ORG_ID,
        student_id: studentId,
        institution_id: input.institution_id,
        academic_year_id: input.academic_year_id,
        standard_id: row.standard_id,
        course_id: row.course_id,
        period_no: row.period_no,
        roll_no: row.roll_no,
      });
    }

    for (let i = 0; i < recordPayload.length; i += 250) {
      const chunk = recordPayload.slice(i, i + 250);
      const { error } = await supabase.from(T.academicRecords).insert(chunk);
      if (error) {
        return {
          ok: false,
          error: `${friendly(error.message)} — students were created but not all enrollments saved`,
        };
      }
    }

    await writeAudit(supabase, {
      entity: "academic_records",
      entityId: null,
      action: "create",
      actor,
      diff: {
        bulk_import: {
          new_students: inserted,
          matched_existing: matched,
          institution_id: input.institution_id,
          academic_year_id: input.academic_year_id,
        },
      },
    });

    revalidatePath("/students");
    revalidatePath("/academic-records");
    revalidatePath("/dashboard");
    return { ok: true, data: { inserted, matched } };
  } catch (e) {
    return { ok: false, error: message(e) };
  }
}
