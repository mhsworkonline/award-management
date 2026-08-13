import { createClient } from "@/lib/supabase/server";
import { ORG_ID } from "@/lib/constants";
import { placementLabel } from "@/lib/placement";
import type { DistributionRow, DistributionStatus, InstitutionType } from "@/lib/types";
import { T } from "@/lib/tables";

type Raw = {
  id: string;
  gift_allocation_id: string;
  status: DistributionStatus;
  distributed_at: string | null;
  distributed_by: string | null;
  sync_status: "synced" | "queued_offline";
  gift_allocations: {
    quantity: number;
    gift_items: { name: string } | null;
    student_awards: {
      subject_or_criteria: string | null;
      award_categories: { name: string } | null;
      academic_records: {
        period_no: number | null;
        academic_years: { id: string; label: string } | null;
        institutions: { name: string; type: InstitutionType } | null;
        standards: { label: string } | null;
        courses: { name: string; structure_type: "year" | "semester" } | null;
        students: { id: string; first_name: string; middle_name: string | null; last_name: string } | null;
      } | null;
    } | null;
  } | null;
};

const SELECT = `
  id, gift_allocation_id, status, distributed_at, distributed_by, sync_status,
  gift_allocations:am_gift_allocations!inner (
    quantity,
    gift_items:am_gift_items ( name ),
    student_awards:am_student_awards!inner (
      subject_or_criteria,
      award_categories:am_award_categories ( name ),
      academic_records:am_academic_records!inner (
        period_no, academic_year_id,
        academic_years:am_academic_years ( id, label ),
        institutions:am_institutions!inner ( name, type ),
        standards:am_standards ( label ),
        courses:am_courses ( name, structure_type ),
        students:am_students!inner ( id, first_name, middle_name, last_name )
      )
    )
  )
`;

export async function listDistribution(filters: {
  academic_year_id?: string;
  institution_id?: string;
  board_id?: string;
  award_category_id?: string;
  status?: DistributionStatus;
  q?: string;
}) {
  const supabase = createClient();

  let query = supabase.from(T.distributionRecords).select(SELECT).eq("org_id", ORG_ID).limit(2000);

  if (filters.status) query = query.eq("status", filters.status);
  if (filters.academic_year_id) {
    query = query.eq(
      "gift_allocations.student_awards.academic_records.academic_year_id",
      filters.academic_year_id,
    );
  }
  if (filters.institution_id) {
    query = query.eq(
      "gift_allocations.student_awards.academic_records.institution_id",
      filters.institution_id,
    );
  }
  if (filters.board_id) {
    query = query.eq(
      "gift_allocations.student_awards.academic_records.institutions.board_id",
      filters.board_id,
    );
  }
  if (filters.award_category_id) {
    query = query.eq("gift_allocations.student_awards.award_category_id", filters.award_category_id);
  }
  if (filters.q) {
    const term = filters.q.replace(/[%,]/g, " ").trim();
    if (term) {
      query = query.or(`first_name.ilike.%${term}%,last_name.ilike.%${term}%`, {
        referencedTable: T.students,
      });
    }
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message);

  const rows = ((data ?? []) as unknown as Raw[])
    .map(flatten)
    .filter((r): r is DistributionRow => r !== null);

  return rows.sort(
    (a, b) =>
      a.institution_name.localeCompare(b.institution_name) ||
      a.award_category.localeCompare(b.award_category) ||
      a.student_name.localeCompare(b.student_name),
  );
}

function flatten(raw: Raw): DistributionRow | null {
  const alloc = raw.gift_allocations;
  const award = alloc?.student_awards;
  const record = award?.academic_records;
  const student = record?.students;
  if (!alloc || !award || !record || !student) return null;

  return {
    id: raw.id,
    gift_allocation_id: raw.gift_allocation_id,
    status: raw.status,
    distributed_at: raw.distributed_at,
    distributed_by: raw.distributed_by,
    sync_status: raw.sync_status,
    quantity: alloc.quantity,
    gift_name: alloc.gift_items?.name ?? "—",
    student_id: student.id,
    student_name: `${student.first_name} ${student.last_name}`,
    father_name: student.middle_name,
    institution_name: record.institutions?.name ?? "—",
    institution_type: record.institutions?.type ?? "school",
    academic_year_id: record.academic_years?.id ?? "",
    academic_year_label: record.academic_years?.label ?? "—",
    award_category: award.award_categories?.name ?? "—",
    placement: placementLabel(record),
  };
}
