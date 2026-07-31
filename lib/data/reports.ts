import { createClient } from "@/lib/supabase/server";
import { ORG_ID } from "@/lib/constants";
import { placementLabel } from "@/lib/placement";
import { academicRecordFilterSchema, type AcademicRecordFilters } from "@/lib/validators";
import { T } from "@/lib/tables";

export type ReportRow = {
  student_name: string;
  father_name: string;
  institution_name: string;
  institution_type: string;
  board: string;
  medium: string;
  placement: string;
  roll_no: string;
  contact_no: string;
  academic_year: string;
  percentage: string;
  grade: string;
  rank: string;
  awards: string;
  gifts: string;
  distribution: string;
};

/** Every export and PDF is built from the same filtered query the roster table
 *  uses, so what the user sees on screen is exactly what they download. */
export function parseFilters(searchParams: URLSearchParams | Record<string, string | undefined>) {
  const raw =
    searchParams instanceof URLSearchParams
      ? Object.fromEntries(searchParams.entries())
      : searchParams;
  const cleaned = Object.fromEntries(
    Object.entries(raw).filter(([, v]) => v !== undefined && v !== "" && v !== "all"),
  );
  const parsed = academicRecordFilterSchema.safeParse(cleaned);
  return parsed.success ? parsed.data : ({} as AcademicRecordFilters);
}

export async function getReportRows(filters: AcademicRecordFilters, limit = 10000) {
  const supabase = createClient();

  let query = supabase
    .from(T.academicRecords)
    .select(
      `
      roll_no, period_no, percentage, grade, rank,
      students:am_students!inner ( first_name, middle_name, last_name, contact_no ),
      institutions:am_institutions!inner ( name, type, boards:am_boards ( name ), mediums:am_mediums ( name ) ),
      academic_years:am_academic_years ( label ),
      standards:am_standards ( label ),
      courses:am_courses ( name, structure_type ),
      student_awards:am_student_awards (
        subject_or_criteria,
        award_categories:am_award_categories ( name, sort_order ),
        gift_allocations:am_gift_allocations (
          quantity,
          gift_items:am_gift_items ( name ),
          distribution_records:am_distribution_records ( status, distributed_at )
        )
      )
    `,
    )
    .eq("org_id", ORG_ID)
    .limit(limit);

  if (filters.academic_year_id) query = query.eq("academic_year_id", filters.academic_year_id);
  if (filters.institution_id) query = query.eq("institution_id", filters.institution_id);
  if (filters.standard_id) query = query.eq("standard_id", filters.standard_id);
  if (filters.course_id) query = query.eq("course_id", filters.course_id);
  if (filters.institution_type) query = query.eq("institutions.type", filters.institution_type);
  if (filters.board_id) query = query.eq("institutions.board_id", filters.board_id);
  if (filters.medium_id) query = query.eq("institutions.medium_id", filters.medium_id);
  if (filters.q) {
    const term = filters.q.replace(/[%,]/g, " ").trim();
    if (term) {
      query = query.or(
        `first_name.ilike.%${term}%,middle_name.ilike.%${term}%,last_name.ilike.%${term}%,roll_no.ilike.%${term}%`,
        { referencedTable: T.students },
      );
    }
  }

  if (filters.award_category_id) {
    const awarded = await supabase
      .from(T.studentAwards)
      .select("academic_record_id")
      .eq("org_id", ORG_ID)
      .eq("award_category_id", filters.award_category_id);
    const ids = (awarded.data ?? []).map((r) => r.academic_record_id);
    if (ids.length === 0) return [];
    query = query.in("id", ids);
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message);

  type Raw = {
    roll_no: string | null;
    period_no: number | null;
    percentage: number | null;
    grade: string | null;
    rank: number | null;
    students: { first_name: string; middle_name: string | null; last_name: string; contact_no: string | null } | null;
    institutions: {
      name: string;
      type: string;
      boards: { name: string } | null;
      mediums: { name: string } | null;
    } | null;
    academic_years: { label: string } | null;
    standards: { label: string } | null;
    courses: { name: string; structure_type: "year" | "semester" } | null;
    student_awards: {
      subject_or_criteria: string | null;
      award_categories: { name: string; sort_order: number } | null;
      gift_allocations: {
        quantity: number;
        gift_items: { name: string } | null;
        distribution_records: { status: string; distributed_at: string | null }[] | null;
      }[];
    }[];
  };

  const rows = (data ?? []) as unknown as Raw[];

  return rows
    .filter((s) => s.students)
    .map<ReportRow>((s) => {
      const awards = [...(s.student_awards ?? [])].sort(
        (a, b) => (a.award_categories?.sort_order ?? 0) - (b.award_categories?.sort_order ?? 0),
      );

      const awardLabels = awards.map((a) =>
        a.subject_or_criteria
          ? `${a.award_categories?.name ?? "—"} (${a.subject_or_criteria})`
          : (a.award_categories?.name ?? "—"),
      );

      const allocations = awards.flatMap((a) => a.gift_allocations ?? []);
      const giftLabels = allocations.map(
        (g) => `${g.gift_items?.name ?? "—"}${g.quantity > 1 ? ` ×${g.quantity}` : ""}`,
      );

      const statuses = allocations.flatMap((g) => g.distribution_records ?? []);
      const distributedCount = statuses.filter((d) => d.status === "distributed").length;
      const distribution =
        statuses.length === 0
          ? "No gift allocated"
          : distributedCount === statuses.length
            ? "Distributed"
            : distributedCount === 0
              ? "Pending"
              : `Partial (${distributedCount}/${statuses.length})`;

      return {
        student_name: `${s.students!.first_name} ${s.students!.last_name}`,
        father_name: s.students!.middle_name ?? "",
        institution_name: s.institutions?.name ?? "",
        institution_type: s.institutions?.type === "college" ? "College" : "School",
        board: s.institutions?.boards?.name ?? "",
        medium: s.institutions?.mediums?.name ?? "",
        placement: placementLabel(s),
        roll_no: s.roll_no ?? "",
        contact_no: s.students!.contact_no ?? "",
        academic_year: s.academic_years?.label ?? "",
        percentage: s.percentage !== null ? `${s.percentage}%` : "",
        grade: s.grade ?? "",
        rank: s.rank !== null ? String(s.rank) : "",
        awards: awardLabels.join(", "),
        gifts: giftLabels.join(", "),
        distribution,
      };
    });
}

/** Human-readable description of the applied filters — printed on PDFs so a
 *  paper copy is never ambiguous about what it contains. */
export async function describeFilters(filters: AcademicRecordFilters) {
  const supabase = createClient();
  const parts: string[] = [];

  const lookup = async (table: string, id: string, column = "name") => {
    const { data } = await supabase.from(table).select(column).eq("id", id).maybeSingle();
    return (data as Record<string, string> | null)?.[column] ?? null;
  };

  if (filters.academic_year_id) {
    const label = await lookup(T.academicYears, filters.academic_year_id, "label");
    if (label) parts.push(`Year: ${label}`);
  }
  if (filters.institution_id) {
    const name = await lookup(T.institutions, filters.institution_id);
    if (name) parts.push(`Institution: ${name}`);
  }
  if (filters.institution_type) {
    parts.push(`Type: ${filters.institution_type === "college" ? "College" : "School"}`);
  }
  if (filters.board_id) {
    const name = await lookup(T.boards, filters.board_id);
    if (name) parts.push(`Board: ${name}`);
  }
  if (filters.medium_id) {
    const name = await lookup(T.mediums, filters.medium_id);
    if (name) parts.push(`Medium: ${name}`);
  }
  if (filters.standard_id) {
    const label = await lookup(T.standards, filters.standard_id, "label");
    if (label) parts.push(`Standard: ${label}`);
  }
  if (filters.course_id) {
    const name = await lookup(T.courses, filters.course_id);
    if (name) parts.push(`Course: ${name}`);
  }
  if (filters.award_category_id) {
    const name = await lookup(T.awardCategories, filters.award_category_id);
    if (name) parts.push(`Award: ${name}`);
  }
  if (filters.q) parts.push(`Search: "${filters.q}"`);

  return parts.length ? parts.join("  ·  ") : "All records";
}
