import { createClient } from "@/lib/supabase/server";
import { ORG_ID } from "@/lib/constants";
import { placementLabel } from "@/lib/placement";
import { studentFullName } from "@/lib/utils";
import { T } from "@/lib/tables";
import {
  SUBMISSION_LIST_COLUMNS,
  DEFAULT_SUBMISSION_LIST_COLUMNS,
  type InstitutionTypeKey,
  type SubmissionListRow,
} from "./submission-report-columns";

// Re-exported for server-side callers (API routes) that already import
// everything from this one module — safe here since nothing in this file
// is ever imported by a client component. The column picker UI itself
// imports straight from submission-report-columns.ts instead (see that
// file's comment for why).
export { SUBMISSION_LIST_COLUMNS, DEFAULT_SUBMISSION_LIST_COLUMNS };
export type { SubmissionListRow };

/** Both reports below share the same population: approved public submissions
 *  for one academic year. Unlike the roster report (which reads
 *  am_academic_records — every enrolled student, awarded or not, for any
 *  source), these read am_public_submissions directly, scoped to `status =
 *  'approved'` — the only submissions that ever produced a student/academic
 *  record. Same RLS convention as the rest of Reports (see 0022's comment):
 *  gated at the page level on Reports:Read, but the underlying tables are
 *  still governed by their own module's RLS (Submissions:Read here, plus
 *  Institutions/Settings:Read to resolve the joined names). */

// ---------------------------------------------------------------- Report 1

export type StandardReportRow = {
  key: string;
  label: string;
  totalStudents: number;
  awarded: number;
  categoryCounts: Record<string, number>;
};

export type StandardReport = {
  categories: { id: string; name: string }[];
  rows: StandardReportRow[];
};

type ApprovedSubmissionForGrouping = {
  academic_record_id: string | null;
  institutions: { type: string } | null;
  standards: { id: string; label: string; level: number } | null;
  streams: { id: string; name: string } | null;
};

/** "Applications by Standard" — one row per Standard (Std 11/12 split by
 *  Stream, colleges pooled into one "Colleges" row — the same grouping
 *  convention as listTopPerformers, so this report reads the same way the
 *  rest of the app already groups students), each with how many approved
 *  applicants there were, how many ended up with at least one award, and a
 *  count per award category. Scoped to awards on students whose academic
 *  record traces back to an approved submission in this standard/year —
 *  never awards from any other source. */
export async function getApplicationsByStandard(
  academicYearId: string,
  types: ReadonlySet<InstitutionTypeKey> = new Set(),
): Promise<StandardReport> {
  const supabase = createClient();

  const [categoriesResult, submissionsResult] = await Promise.all([
    supabase
      .from(T.awardCategories)
      .select("id, name, sort_order")
      .eq("org_id", ORG_ID)
      .order("sort_order"),
    supabase
      .from(T.publicSubmissions)
      .select(
        `academic_record_id,
         institutions:am_institutions ( type ),
         standards:am_standards ( id, label, level ),
         streams:am_streams ( id, name )`,
      )
      .eq("org_id", ORG_ID)
      .eq("status", "approved")
      .eq("academic_year_id", academicYearId)
      .limit(5000),
  ]);
  if (categoriesResult.error) throw new Error(categoriesResult.error.message);
  if (submissionsResult.error) throw new Error(submissionsResult.error.message);

  const categories = categoriesResult.data ?? [];
  // Empty selection = every type. Same school/college split the buckets below
  // use: a school with a Standard is a school, everything else is pooled as
  // "Colleges".
  const submissions = ((submissionsResult.data ?? []) as unknown as ApprovedSubmissionForGrouping[]).filter(
    (s) => types.size === 0 || types.has(s.institutions?.type === "school" && s.standards ? "school" : "college"),
  );

  const STREAM_LEVELS = new Set([11, 12]);
  const buckets = new Map<
    string,
    { label: string; level: number; streamName: string; recordIds: string[] }
  >();
  const collegeRecordIds: string[] = [];

  for (const s of submissions) {
    if (!s.academic_record_id) continue; // approved always has one; defensive only
    if (s.institutions?.type === "school" && s.standards) {
      const splitByStream = STREAM_LEVELS.has(s.standards.level);
      const streamKey = splitByStream ? (s.streams?.id ?? "unspecified") : "";
      const streamName = splitByStream ? (s.streams?.name ?? "Unspecified stream") : "";
      const key = `${s.standards.id}:${streamKey}`;
      const label = splitByStream ? `${s.standards.label} — ${streamName}` : s.standards.label;

      const existing = buckets.get(key);
      if (existing) existing.recordIds.push(s.academic_record_id);
      else buckets.set(key, { label, level: s.standards.level, streamName, recordIds: [s.academic_record_id] });
    } else {
      collegeRecordIds.push(s.academic_record_id);
    }
  }

  const allRecordIds = submissions.map((s) => s.academic_record_id).filter((id): id is string => !!id);
  const awardsResult = allRecordIds.length
    ? await supabase
        .from(T.studentAwards)
        .select("academic_record_id, award_category_id")
        .eq("org_id", ORG_ID)
        .in("academic_record_id", allRecordIds)
    : { data: [] as { academic_record_id: string; award_category_id: string }[], error: null };
  if (awardsResult.error) throw new Error(awardsResult.error.message);

  const awardsByRecord = new Map<string, string[]>();
  for (const a of awardsResult.data ?? []) {
    const list = awardsByRecord.get(a.academic_record_id);
    if (list) list.push(a.award_category_id);
    else awardsByRecord.set(a.academic_record_id, [a.award_category_id]);
  }

  function summarize(recordIds: string[]) {
    const categoryCounts: Record<string, number> = {};
    for (const c of categories) categoryCounts[c.id] = 0;
    let awarded = 0;
    for (const id of recordIds) {
      const cats = awardsByRecord.get(id);
      if (cats && cats.length > 0) {
        awarded += 1;
        for (const catId of cats) categoryCounts[catId] = (categoryCounts[catId] ?? 0) + 1;
      }
    }
    return { totalStudents: recordIds.length, awarded, categoryCounts };
  }

  const rows: StandardReportRow[] = [...buckets.entries()]
    .sort(([, a], [, b]) => a.level - b.level || a.streamName.localeCompare(b.streamName))
    .map(([key, b]) => ({ key, label: b.label, ...summarize(b.recordIds) }));

  if (collegeRecordIds.length > 0) {
    rows.push({ key: "colleges", label: "Colleges", ...summarize(collegeRecordIds) });
  }

  return { categories: categories.map((c) => ({ id: c.id, name: c.name })), rows };
}

// ---------------------------------------------------------------- Report 2

type ApprovedSubmissionRaw = {
  reference_code: string;
  salutation: string | null;
  first_name: string;
  middle_name: string | null;
  last_name: string;
  percentage: number | null;
  grade: string | null;
  roll_no: string | null;
  contact_no: string | null;
  email: string | null;
  reviewed_by: string | null;
  academic_record_id: string | null;
  institution_id: string | null;
  other_institution_name: string | null;
  other_course_name: string | null;
  other_course_structure: "year" | "semester" | null;
  period_no: number | null;
  institutions: { name: string; type: string } | null;
  boards: { name: string } | null;
  mediums: { name: string } | null;
  standards: { label: string; level: number } | null;
  streams: { name: string } | null;
  courses: { name: string; structure_type: "year" | "semester" } | null;
};

/** Row-per-student list of every approved submission for one academic year —
 *  the full field set; the column picker in the UI decides what's actually
 *  shown or exported. Always carries a group_label/group_sort (one section
 *  per Standard, or per college course) — see groupSubmissionRows(). */
export async function getApprovedSubmissionsList(academicYearId: string): Promise<SubmissionListRow[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from(T.publicSubmissions)
    .select(
      `reference_code, salutation, first_name, middle_name, last_name,
       percentage, grade, roll_no, contact_no, email, reviewed_by, academic_record_id,
       institution_id, other_institution_name, other_course_name, other_course_structure, period_no,
       institutions:am_institutions ( name, type ),
       boards:am_boards ( name ),
       mediums:am_mediums ( name ),
       standards:am_standards ( label, level ),
       streams:am_streams ( name ),
       courses:am_courses ( name, structure_type )`,
    )
    .eq("org_id", ORG_ID)
    .eq("status", "approved")
    .eq("academic_year_id", academicYearId)
    .order("reference_code")
    .limit(5000);
  if (error) throw new Error(error.message);

  const rows = (data ?? []) as unknown as ApprovedSubmissionRaw[];

  // One extra query for every award in play, then joined in memory by
  // academic_record_id — same pattern getApplicationsByStandard uses,
  // cheaper than a per-row query.
  type AwardRaw = {
    academic_record_id: string;
    subject_or_criteria: string | null;
    award_categories: { name: string; sort_order: number } | null;
  };
  const recordIds = rows.map((r) => r.academic_record_id).filter((id): id is string => !!id);
  let awardsData: AwardRaw[] = [];
  if (recordIds.length) {
    const awardsResult = await supabase
      .from(T.studentAwards)
      .select(
        `academic_record_id, subject_or_criteria,
         award_categories:am_award_categories ( name, sort_order )`,
      )
      .eq("org_id", ORG_ID)
      .in("academic_record_id", recordIds);
    if (awardsResult.error) throw new Error(awardsResult.error.message);
    awardsData = (awardsResult.data ?? []) as unknown as AwardRaw[];
  }

  const awardsByRecord = new Map<string, { name: string; sort_order: number; subject: string | null }[]>();
  for (const a of awardsData) {
    const entry = { name: a.award_categories?.name ?? "—", sort_order: a.award_categories?.sort_order ?? 0, subject: a.subject_or_criteria };
    const list = awardsByRecord.get(a.academic_record_id);
    if (list) list.push(entry);
    else awardsByRecord.set(a.academic_record_id, [entry]);
  }

  return rows.map((s) => {
    const hasMatchedPlacement = !!(s.standards || s.courses);
    const placement = hasMatchedPlacement
      ? placementLabel(s)
      : s.other_course_name
        ? `${s.other_course_name} (${s.other_course_structure === "semester" ? "Sem" : "Year"}${
            s.period_no ? ` ${s.period_no}` : ""
          })`
        : "—";

    const awardsForStudent = s.academic_record_id ? (awardsByRecord.get(s.academic_record_id) ?? []) : [];
    const awardsLabel = [...awardsForStudent]
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((a) => (a.subject ? `${a.name} (${a.subject})` : a.name))
      .join(", ");

    // Every Standard (or course, for colleges) is its own group — unlike
    // Report 1, streams and semesters don't split a group further here.
    const groupLabel = s.standards?.label ?? s.courses?.name ?? s.other_course_name ?? "Other";
    const groupSort = s.standards
      ? `0-${String(s.standards.level + 100).padStart(3, "0")}-${groupLabel}`
      : `1-${groupLabel}`;

    return {
      code: s.reference_code,
      applicant: studentFullName({
        salutation: s.salutation,
        first_name: s.first_name,
        middle_name: s.middle_name,
        last_name: s.last_name,
      }),
      institution: s.institutions?.name ?? s.other_institution_name ?? "—",
      placement,
      awards: awardsLabel,
      percentage: s.percentage !== null ? `${s.percentage}%` : "",
      grade: s.grade ?? "",
      board: s.boards?.name ?? "",
      medium: s.mediums?.name ?? "",
      roll_no: s.roll_no ?? "",
      contact_no: s.contact_no ?? "",
      email: s.email ?? "",
      reviewed_by: s.reviewed_by ?? "",
      group_label: groupLabel,
      group_sort: groupSort,
      sort_name: [s.first_name, s.last_name, s.middle_name].filter(Boolean).join(" "),
      sort_percentage: s.percentage,
      institution_id: s.institution_id,
      // Same rule as the Submissions table's Type column.
      institution_type: s.institutions
        ? s.institutions.type === "college"
          ? "college"
          : "school"
        : s.courses || s.other_course_name
          ? "college"
          : "school",
    };
  });
}
