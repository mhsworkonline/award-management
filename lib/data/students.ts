import { createClient } from "@/lib/supabase/server";
import { ORG_ID } from "@/lib/constants";
import { normalizeName } from "@/lib/utils";
import { T } from "@/lib/tables";
import type { StudentWithRecords } from "@/lib/types";

const DETAIL_SELECT = `
  *,
  academic_records:am_academic_records (
    *,
    institutions:am_institutions ( id, name, type ),
    academic_years:am_academic_years ( id, label ),
    standards:am_standards ( id, label ),
    courses:am_courses ( id, name, structure_type ),
    student_awards:am_student_awards ( id, subject_or_criteria, award_categories:am_award_categories ( id, name ) )
  )
`;

export async function getStudent(id: string) {
  const supabase = createClient();
  const { data, error } = await supabase
    .from(T.students)
    .select(DETAIL_SELECT)
    .eq("org_id", ORG_ID)
    .eq("id", id)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data as unknown as StudentWithRecords | null;
}

/** Persistent-identity duplicate check — a student exists once regardless of
 *  how many years/institutions they've been enrolled in, so this matches on
 *  name only, org-wide. A warning, never a hard block — namesakes are real. */
export async function findDuplicateStudents(input: {
  first_name: string;
  middle_name?: string | null;
  last_name: string;
  excludeId?: string;
}) {
  const supabase = createClient();
  const term = input.first_name.trim().split(/\s+/)[0] ?? input.first_name;

  let query = supabase
    .from(T.students)
    .select("id, first_name, middle_name, last_name, academic_records:am_academic_records(institutions:am_institutions(name), academic_years:am_academic_years(label))")
    .eq("org_id", ORG_ID)
    .ilike("first_name", `%${term}%`)
    .limit(25);

  if (input.excludeId) query = query.neq("id", input.excludeId);

  const { data } = await query;
  const targetFirst = normalizeName(input.first_name);
  const targetMiddle = normalizeName(input.middle_name);
  const targetLast = normalizeName(input.last_name);

  return (data ?? []).filter((row) => {
    if (normalizeName(row.first_name) !== targetFirst) return false;
    if (normalizeName(row.last_name) !== targetLast) return false;
    const middle = normalizeName(row.middle_name);
    if (targetMiddle && middle) return middle === targetMiddle;
    return true;
  });
}

/** Free-text student search by name — used to enroll an already-known student
 *  into another institution/year, independent of the strict duplicate match. */
export async function searchStudentsByName(term: string, limit = 20) {
  const supabase = createClient();
  const cleaned = term.replace(/[%,]/g, " ").trim();
  if (!cleaned) return [];

  const { data } = await supabase
    .from(T.students)
    .select("id, first_name, middle_name, last_name")
    .eq("org_id", ORG_ID)
    .or(`first_name.ilike.%${cleaned}%,middle_name.ilike.%${cleaned}%,last_name.ilike.%${cleaned}%`)
    .order("first_name")
    .limit(limit);

  return data ?? [];
}
