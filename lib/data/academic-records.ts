import { createClient } from "@/lib/supabase/server";
import { ORG_ID, PAGE_SIZE } from "@/lib/constants";
import type { AcademicRecordFilters } from "@/lib/validators";
import type { AcademicRecordRow } from "@/lib/types";
import { placementLabel } from "@/lib/placement";
import { REL, T } from "@/lib/tables";

const SELECT = `
  *,
  students:am_students!inner ( id, salutation, first_name, middle_name, last_name, lanedaar_name, email, contact_no, photo_path ),
  institutions:am_institutions!inner ( id, name, type, board_id, medium_id ),
  academic_years:am_academic_years ( id, label ),
  standards:am_standards ( id, label ),
  streams:am_streams ( id, name ),
  courses:am_courses ( id, name, structure_type ),
  student_awards:am_student_awards ( id, subject_or_criteria, award_categories:am_award_categories ( id, name ) )
`;

// Only own-table columns are sortable server-side — ordering through a joined
// table is unreliable across PostgREST versions, and these four cover the
// actual use cases (roster order, ranking, recency).
const SORTABLE: Record<string, string> = {
  roll_no: "roll_no",
  percentage: "percentage",
  rank: "rank",
  created_at: "created_at",
};

/** The roster — one row per student-year enrollment. This is what the Students
 *  list page actually filters and displays; the persistent Student record only
 *  surfaces on the detail panel and the add/edit forms. */
export async function listAcademicRecords(filters: AcademicRecordFilters) {
  const supabase = createClient();
  const page = filters.page ?? 1;
  const size = filters.size ?? PAGE_SIZE;
  const ascending = (filters.dir ?? "asc") === "asc";

  let query = supabase
    .from(T.academicRecords)
    .select(SELECT, { count: "exact" })
    .eq("org_id", ORG_ID);

  if (filters.academic_year_id) query = query.eq("academic_year_id", filters.academic_year_id);
  if (filters.institution_id) query = query.eq("institution_id", filters.institution_id);
  if (filters.standard_id) query = query.eq("standard_id", filters.standard_id);
  if (filters.stream_id) query = query.eq("stream_id", filters.stream_id);
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
    if (ids.length === 0) return { rows: [] as AcademicRecordRow[], total: 0, page, size };
    query = query.in("id", ids);
  }

  const sort = SORTABLE[filters.sort ?? ""] ?? "created_at";
  const from = (page - 1) * size;
  const { data, count, error } = await query
    .order(sort, { ascending, nullsFirst: false })
    .range(from, from + size - 1);

  if (error) throw new Error(error.message);

  const rows = (data ?? []) as unknown as AcademicRecordRow[];
  // Default view reads best alphabetically by student — done client-side since
  // it spans a joined table that PostgREST can't order by directly.
  if (!filters.sort) {
    rows.sort((a, b) =>
      (a.students?.first_name ?? "").localeCompare(b.students?.first_name ?? "") ||
      (a.students?.last_name ?? "").localeCompare(b.students?.last_name ?? ""),
    );
  }

  return { rows, total: count ?? 0, page, size };
}

export async function getAcademicRecord(id: string) {
  const supabase = createClient();
  const { data, error } = await supabase
    .from(T.academicRecords)
    .select(SELECT.replace(`${REL.institutions}!inner`, REL.institutions).replace(`${REL.students}!inner`, REL.students))
    .eq("org_id", ORG_ID)
    .eq("id", id)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data as unknown as AcademicRecordRow | null;
}

/** Powers the bulk grade-entry table: every enrolled record for one
 *  institution + year + (standard or course/period), regardless of whether a
 *  grade has been entered yet. */
export async function listRosterForGrading(input: {
  institution_id: string;
  academic_year_id: string;
  standard_id?: string;
  stream_id?: string;
  course_id?: string;
  period_no?: number;
}) {
  const supabase = createClient();

  let query = supabase
    .from(T.academicRecords)
    .select(
      `id, roll_no, percentage, grade, rank,
       students:am_students!inner ( id, salutation, first_name, middle_name, last_name )`,
    )
    .eq("org_id", ORG_ID)
    .eq("institution_id", input.institution_id)
    .eq("academic_year_id", input.academic_year_id)
    .limit(500);

  if (input.standard_id) query = query.eq("standard_id", input.standard_id);
  if (input.stream_id) query = query.eq("stream_id", input.stream_id);
  if (input.course_id) query = query.eq("course_id", input.course_id);
  if (input.period_no) query = query.eq("period_no", input.period_no);

  const { data, error } = await query;
  if (error) throw new Error(error.message);

  type Row = {
    id: string;
    roll_no: string | null;
    percentage: number | null;
    grade: string | null;
    rank: number | null;
    students: { id: string; first_name: string; middle_name: string | null; last_name: string } | null;
  };

  return ((data ?? []) as unknown as Row[])
    .filter((r) => r.students)
    .map((r) => ({
      id: r.id,
      roll_no: r.roll_no,
      percentage: r.percentage,
      grade: r.grade,
      rank: r.rank,
      student_id: r.students!.id,
      first_name: r.students!.first_name,
      middle_name: r.students!.middle_name,
      last_name: r.students!.last_name,
    }))
    .sort((a, b) => (a.roll_no ?? "").localeCompare(b.roll_no ?? "") || a.first_name.localeCompare(b.first_name));
}

export type TopPerformer = {
  academic_record_id: string;
  percentage: number | null;
  rank: number | null;
  roll_no: string | null;
  student_name: string;
  father_name: string | null;
  institution_name: string;
  placement: string;
};

export type TopPerformerGroup = {
  key: string;
  label: string;
  performers: TopPerformer[];
};

/** Top performers per year that don't have an award yet — feeds the
 *  "suggested" panel on the Awards page. Manual assignment stays available
 *  regardless; this is a shortcut, not the only path.
 *
 *  Grouped by Standard for schools — a school award is decided by Standard
 *  alone, pooling every student in that Standard across every institution,
 *  board and medium, so a Std 5 topper must never be ranked against a Std
 *  12 topper on the same list. Std 11 and 12 split one level further, into
 *  Arts/Commerce/Science (see 0032_am_streams.sql) — those students sit
 *  different subjects entirely, so a raw percentage isn't comparable across
 *  streams the way it is within one. A record with no stream set yet (data
 *  from before this feature existed) lands in its own "Unspecified stream"
 *  group rather than being silently dropped or mixed into a real one.
 *  Colleges have no such rule (a "Standard" doesn't apply to a
 *  degree/diploma), so they stay exactly as before: one combined list
 *  ranked by raw percentage across every course. */
export async function listTopPerformers(input: {
  academic_year_id: string;
  institution_id?: string;
  limit?: number;
}): Promise<TopPerformerGroup[]> {
  const supabase = createClient();
  const perGroupLimit = input.limit ?? 10;

  let query = supabase
    .from(T.academicRecords)
    .select(
      `id, percentage, rank, roll_no,
       students:am_students!inner ( id, salutation, first_name, middle_name, last_name ),
       institutions:am_institutions!inner ( id, name, type ),
       standards:am_standards ( id, label, level ),
       streams:am_streams ( id, name ),
       courses:am_courses ( id, name, structure_type ),
       student_awards:am_student_awards ( id )`,
    )
    .eq("org_id", ORG_ID)
    .eq("academic_year_id", input.academic_year_id)
    .not("percentage", "is", null)
    .order("percentage", { ascending: false })
    // Enough headroom that a standard with many students isn't starved by
    // an unrelated standard's students filling up a single shared cap.
    .limit(3000);

  if (input.institution_id) query = query.eq("institution_id", input.institution_id);

  const { data, error } = await query;
  if (error) throw new Error(error.message);

  type Row = {
    id: string;
    percentage: number | null;
    rank: number | null;
    roll_no: string | null;
    students: { id: string; first_name: string; middle_name: string | null; last_name: string } | null;
    institutions: { id: string; name: string; type: string } | null;
    standards: { id: string; label: string; level: number } | null;
    streams: { id: string; name: string } | null;
    courses: { id: string; name: string; structure_type: "year" | "semester" } | null;
    student_awards: { id: string }[];
  };

  const eligible = ((data ?? []) as unknown as Row[]).filter(
    (r) => r.students && r.student_awards.length === 0,
  );

  const toPerformer = (r: Row): TopPerformer => ({
    academic_record_id: r.id,
    percentage: r.percentage,
    rank: r.rank,
    roll_no: r.roll_no,
    student_name: `${r.students!.first_name} ${r.students!.last_name}`,
    father_name: r.students!.middle_name,
    institution_name: r.institutions?.name ?? "—",
    placement: placementLabel(r),
  });

  const STREAM_LEVELS = new Set([11, 12]);
  const schoolGroups = new Map<string, { label: string; level: number; streamName: string; rows: Row[] }>();
  const collegeRows: Row[] = [];

  for (const r of eligible) {
    if (r.institutions?.type === "school" && r.standards) {
      const splitByStream = STREAM_LEVELS.has(r.standards.level);
      const streamKey = splitByStream ? (r.streams?.id ?? "unspecified") : "";
      const streamName = splitByStream ? (r.streams?.name ?? "Unspecified stream") : "";
      const key = `${r.standards.id}:${streamKey}`;
      const label = splitByStream ? `${r.standards.label} — ${streamName}` : r.standards.label;

      const existing = schoolGroups.get(key);
      if (existing) existing.rows.push(r);
      else schoolGroups.set(key, { label, level: r.standards.level, streamName, rows: [r] });
    } else {
      collegeRows.push(r);
    }
  }

  const groups: TopPerformerGroup[] = [...schoolGroups.entries()]
    .sort(([, a], [, b]) => a.level - b.level || a.streamName.localeCompare(b.streamName))
    .map(([groupKey, group]) => ({
      key: groupKey,
      label: group.label,
      performers: group.rows.slice(0, perGroupLimit).map(toPerformer),
    }));

  if (collegeRows.length > 0) {
    groups.push({
      key: "colleges",
      label: "Colleges",
      performers: collegeRows.slice(0, perGroupLimit).map(toPerformer),
    });
  }

  return groups;
}
