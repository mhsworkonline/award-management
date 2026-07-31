"use server";

import { requireUser } from "@/lib/supabase/server";
import { searchAwardableRecords } from "@/lib/data/awards";
import { searchStudentsByName } from "@/lib/data/students";
import { message } from "@/lib/actions/crud";
import type { ActionResult } from "@/lib/types";

export type RecordOption = {
  academic_record_id: string;
  student_name: string;
  father_name: string | null;
  institution_name: string;
  placement: string;
};

/** Typeahead for the award picker — searches this year's enrollments by
 *  student name and returns the specific academic-record id to award. */
export async function searchStudents(input: {
  academic_year_id: string;
  q: string;
  institution_id?: string;
}): Promise<ActionResult<RecordOption[]>> {
  try {
    await requireUser();
    const rows = await searchAwardableRecords(input);
    return { ok: true, data: rows };
  } catch (e) {
    return { ok: false, error: message(e) };
  }
}

export type ExistingStudentOption = {
  id: string;
  name: string;
};

/** Typeahead for "enroll an existing student" — persistent-identity search,
 *  independent of any particular year. */
export async function searchExistingStudents(q: string): Promise<ActionResult<ExistingStudentOption[]>> {
  try {
    await requireUser();
    const rows = await searchStudentsByName(q);
    return {
      ok: true,
      data: rows.map((r) => ({
        id: r.id,
        name: [r.first_name, r.middle_name, r.last_name].filter(Boolean).join(" "),
      })),
    };
  } catch (e) {
    return { ok: false, error: message(e) };
  }
}
