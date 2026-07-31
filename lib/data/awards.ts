import { createClient } from "@/lib/supabase/server";
import { ORG_ID } from "@/lib/constants";
import { placementLabel } from "@/lib/placement";
import type { InstitutionType } from "@/lib/types";
import { T } from "@/lib/tables";

export type AwardRow = {
  id: string;
  academic_record_id: string;
  student_id: string;
  student_name: string;
  father_name: string | null;
  institution_name: string;
  institution_type: InstitutionType;
  placement: string;
  academic_year_label: string;
  category_name: string;
  category_sort: number;
  subject_or_criteria: string | null;
  allocations: {
    id: string;
    quantity: number;
    gift_name: string;
    distribution_status: string;
  }[];
};

type Raw = {
  id: string;
  academic_record_id: string;
  subject_or_criteria: string | null;
  award_categories: { name: string; sort_order: number } | null;
  academic_records: {
    id: string;
    period_no: number | null;
    academic_years: { label: string } | null;
    standards: { label: string } | null;
    courses: { name: string; structure_type: "year" | "semester" } | null;
    institutions: { name: string; type: InstitutionType } | null;
    students: { id: string; first_name: string; middle_name: string | null; last_name: string } | null;
  } | null;
  gift_allocations: {
    id: string;
    quantity: number;
    gift_items: { name: string } | null;
    distribution_records: { status: string }[] | null;
  }[];
};

export async function listAwards(filters: {
  academic_year_id?: string;
  institution_id?: string;
  award_category_id?: string;
  q?: string;
}) {
  const supabase = createClient();

  let query = supabase
    .from(T.studentAwards)
    .select(
      `
      id, academic_record_id, subject_or_criteria,
      award_categories:am_award_categories ( name, sort_order ),
      academic_records:am_academic_records!inner (
        id, period_no, academic_year_id,
        academic_years:am_academic_years ( label ),
        standards:am_standards ( label ),
        courses:am_courses ( name, structure_type ),
        institutions:am_institutions!inner ( name, type ),
        students:am_students!inner ( id, first_name, middle_name, last_name )
      ),
      gift_allocations:am_gift_allocations (
        id, quantity,
        gift_items:am_gift_items ( name ),
        distribution_records:am_distribution_records ( status )
      )
    `,
    )
    .eq("org_id", ORG_ID)
    .limit(2000);

  if (filters.academic_year_id) {
    query = query.eq("academic_records.academic_year_id", filters.academic_year_id);
  }
  if (filters.award_category_id) query = query.eq("award_category_id", filters.award_category_id);
  if (filters.institution_id) query = query.eq("academic_records.institution_id", filters.institution_id);
  if (filters.q) {
    const term = filters.q.replace(/[%,]/g, " ").trim();
    if (term) {
      query = query.or(
        `first_name.ilike.%${term}%,middle_name.ilike.%${term}%,last_name.ilike.%${term}%`,
        { referencedTable: T.students },
      );
    }
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message);

  const rows = ((data ?? []) as unknown as Raw[])
    .map<AwardRow | null>((r) => {
      const record = r.academic_records;
      const student = record?.students;
      if (!record || !student) return null;
      return {
        id: r.id,
        academic_record_id: record.id,
        student_id: student.id,
        student_name: `${student.first_name} ${student.last_name}`,
        father_name: student.middle_name,
        institution_name: record.institutions?.name ?? "—",
        institution_type: record.institutions?.type ?? "school",
        placement: placementLabel(record),
        academic_year_label: record.academic_years?.label ?? "—",
        category_name: r.award_categories?.name ?? "—",
        category_sort: r.award_categories?.sort_order ?? 0,
        subject_or_criteria: r.subject_or_criteria,
        allocations: (r.gift_allocations ?? []).map((a) => ({
          id: a.id,
          quantity: a.quantity,
          gift_name: a.gift_items?.name ?? "—",
          distribution_status: a.distribution_records?.[0]?.status ?? "pending",
        })),
      };
    })
    .filter((r): r is AwardRow => r !== null);

  return rows.sort(
    (a, b) =>
      a.institution_name.localeCompare(b.institution_name) ||
      a.category_sort - b.category_sort ||
      a.student_name.localeCompare(b.student_name),
  );
}

/** Academic records eligible to receive a new award — the award picker
 *  searches by student name but selects a specific year's enrollment. */
export async function searchAwardableRecords(input: {
  academic_year_id: string;
  q: string;
  institution_id?: string;
}) {
  const supabase = createClient();
  const term = input.q.replace(/[%,]/g, " ").trim();
  if (!term || !input.academic_year_id) return [];

  let query = supabase
    .from(T.academicRecords)
    .select(
      `id, period_no,
       students:am_students!inner ( id, first_name, middle_name, last_name ),
       institutions:am_institutions!inner ( name, type ),
       standards:am_standards ( label ),
       courses:am_courses ( name, structure_type )`,
    )
    .eq("org_id", ORG_ID)
    .eq("academic_year_id", input.academic_year_id)
    .or(`first_name.ilike.%${term}%,last_name.ilike.%${term}%`, { referencedTable: T.students })
    .limit(20);

  if (input.institution_id) query = query.eq("institution_id", input.institution_id);

  const { data } = await query;

  type Row = {
    id: string;
    period_no: number | null;
    students: { id: string; first_name: string; middle_name: string | null; last_name: string } | null;
    institutions: { name: string; type: string } | null;
    standards: { label: string } | null;
    courses: { name: string; structure_type: "year" | "semester" } | null;
  };

  return ((data ?? []) as unknown as Row[])
    .filter((r) => r.students)
    .map((r) => ({
      academic_record_id: r.id,
      student_name: `${r.students!.first_name} ${r.students!.last_name}`,
      father_name: r.students!.middle_name,
      institution_name: r.institutions?.name ?? "—",
      placement: placementLabel(r),
    }));
}
