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

/** What a sortable column means, both ways it can be evaluated:
 *  - `db`: PostgREST order terms. `rel(col)` orders the *parent* rows by a
 *    to-one embedded column — the older `foreignTable` option only reorders
 *    rows nested inside the embed and leaves the parents unsorted, which is
 *    why the previous Student/Institution sort keys did nothing. The prefix
 *    must be the SELECT alias ("students"), not the physical `am_*` name.
 *  - `mem`: the same ordering computed in JS, for when the page is assembled
 *    in memory (see listAcademicRecords). Awards has no `db` form — it's a
 *    count over a related table, so it only exists in memory. */
type LightRow = {
  id: string;
  roll_no: string | null;
  percentage: number | null;
  grade: string | null;
  rank: number | null;
  created_at: string;
  students: { first_name: string; middle_name: string | null; last_name: string } | null;
  institutions: { name: string } | null;
  academic_years: { label: string } | null;
  standards: { level: number } | null;
  courses: { name: string } | null;
  student_awards: { id: string }[] | null;
};
type SortValue = string | number | null;

const SORTABLE: Record<string, { db?: string[]; mem: (r: LightRow) => SortValue[] }> = {
  student: {
    db: ["students(first_name)", "students(last_name)"],
    mem: (r) => [r.students?.first_name ?? null, r.students?.last_name ?? null],
  },
  father: { db: ["students(middle_name)"], mem: (r) => [r.students?.middle_name ?? null] },
  institution: { db: ["institutions(name)"], mem: (r) => [r.institutions?.name ?? null] },
  // A school record's Standard and a college record's Course live in different
  // tables, so order by Standard level first (schools), then Course name.
  placement: {
    db: ["standards(level)", "courses(name)"],
    mem: (r) => [r.standards?.level ?? null, r.courses?.name ?? null],
  },
  year: { db: ["academic_years(label)"], mem: (r) => [r.academic_years?.label ?? null] },
  roll_no: { db: ["roll_no"], mem: (r) => [r.roll_no] },
  percentage: { db: ["percentage"], mem: (r) => [r.percentage] },
  grade: { db: ["grade"], mem: (r) => [r.grade] },
  rank: { db: ["rank"], mem: (r) => [r.rank] },
  created_at: { db: ["created_at"], mem: (r) => [r.created_at] },
  awards: { mem: (r) => [r.student_awards?.length ?? 0] },
};

const DEFAULT_SORT = "student";
const FETCH_CHUNK = 1000; // PostgREST's default max-rows per request

function compareValues(a: SortValue, b: SortValue, ascending: boolean) {
  if (a === null && b === null) return 0;
  if (a === null) return 1; // nulls last, either direction — matches `nullslast` in SQL
  if (b === null) return -1;
  const result =
    typeof a === "number" && typeof b === "number"
      ? a - b
      : String(a).localeCompare(String(b), undefined, { sensitivity: "base", numeric: true });
  return ascending ? result : -result;
}

/** The roster — one row per student-year enrollment. This is what the Students
 *  list page actually filters and displays; the persistent Student record only
 *  surfaces on the detail panel and the add/edit forms.
 *
 *  Two paths, same result shape. Normally the database filters, sorts and
 *  pages. But a name/roll search (each word may hit first, father's or last
 *  name, or the roll no — and roll_no lives on a different table than the
 *  names, which PostgREST can't OR together) and sorting by Awards (a count)
 *  can't be expressed as one query, so those fetch the matching rows'
 *  lightweight columns, filter/sort them in memory, and only then load the
 *  full rows for the requested page. Either way it spans *every* matching
 *  record, never just the visible page. */
export async function listAcademicRecords(
  filters: AcademicRecordFilters,
  options: { unawarded?: boolean } = {},
) {
  const supabase = createClient();
  const page = filters.page ?? 1;
  const size = filters.size ?? PAGE_SIZE;
  const ascending = (filters.dir ?? "asc") === "asc";
  const sortKey = filters.sort && SORTABLE[filters.sort] ? filters.sort : DEFAULT_SORT;
  const sort = SORTABLE[sortKey];
  const tokens = (filters.q ?? "")
    .replace(/[%,]/g, " ")
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);
  const inMemory = tokens.length > 0 || !sort.db;
  const from = (page - 1) * size;

  // `unawarded` (the Awards page's "Not yet awarded" worklist) filters to
  // records with zero awards via a PostgREST anti-join — which needs the
  // awards embed spelled as an explicit left join. Only rewritten for that
  // case, so every other caller's query is byte-for-byte what it was.
  const awardsEmbed = options.unawarded ? "am_student_awards!left" : "am_student_awards";
  const select = options.unawarded
    ? SELECT.replace("student_awards:am_student_awards (", "student_awards:am_student_awards!left (")
    : SELECT;

  let awardedRecordIds: string[] | null = null;
  if (filters.award_category_id) {
    const awarded = await supabase
      .from(T.studentAwards)
      .select("academic_record_id")
      .eq("org_id", ORG_ID)
      .eq("award_category_id", filters.award_category_id);
    awardedRecordIds = (awarded.data ?? []).map((r) => r.academic_record_id);
    if (awardedRecordIds.length === 0) return { rows: [] as AcademicRecordRow[], total: 0, page, size };
  }

  const filtered = (columns: string, withCount: boolean) => {
    let query = supabase
      .from(T.academicRecords)
      .select(columns, withCount ? { count: "exact" } : undefined)
      .eq("org_id", ORG_ID);

    if (options.unawarded) query = query.is("student_awards", null);
    if (filters.academic_year_id) query = query.eq("academic_year_id", filters.academic_year_id);
    if (filters.institution_id) query = query.eq("institution_id", filters.institution_id);
    if (filters.standard_id) query = query.eq("standard_id", filters.standard_id);
    if (filters.stream_id) query = query.eq("stream_id", filters.stream_id);
    if (filters.course_id) query = query.eq("course_id", filters.course_id);
    if (filters.institution_type) query = query.eq("institutions.type", filters.institution_type);
    if (filters.board_id) query = query.eq("institutions.board_id", filters.board_id);
    if (filters.medium_id) query = query.eq("institutions.medium_id", filters.medium_id);
    if (awardedRecordIds) query = query.in("id", awardedRecordIds);
    return query;
  };

  if (!inMemory) {
    let query = filtered(select, true);
    for (const column of sort.db!) query = query.order(column, { ascending, nullsFirst: false });
    // Unique tiebreaker so rows never shuffle or repeat across pages.
    const { data, count, error } = await query.order("id").range(from, from + size - 1);
    if (error) throw new Error(error.message);
    return { rows: (data ?? []) as unknown as AcademicRecordRow[], total: count ?? 0, page, size };
  }

  const light = `id, roll_no, percentage, grade, rank, created_at,
    students:am_students!inner ( first_name, middle_name, last_name ),
    institutions:am_institutions!inner ( name ),
    academic_years:am_academic_years ( label ),
    standards:am_standards ( level ),
    courses:am_courses ( name ),
    student_awards:${awardsEmbed} ( id )`;

  const all: LightRow[] = [];
  for (let start = 0; ; start += FETCH_CHUNK) {
    const { data, error } = await filtered(light, false)
      .order("id")
      .range(start, start + FETCH_CHUNK - 1);
    if (error) throw new Error(error.message);
    const chunk = (data ?? []) as unknown as LightRow[];
    all.push(...chunk);
    if (chunk.length < FETCH_CHUNK) break;
  }

  const matches =
    tokens.length === 0
      ? all
      : all.filter((r) => {
          const haystack = [r.students?.first_name, r.students?.middle_name, r.students?.last_name, r.roll_no]
            .filter(Boolean)
            .join(" ")
            .toLowerCase();
          return tokens.every((t) => haystack.includes(t));
        });

  const nameOrder = SORTABLE.student.mem;
  matches.sort((a, b) => {
    const [ka, kb] = [sort.mem(a), sort.mem(b)];
    for (let i = 0; i < ka.length; i++) {
      const result = compareValues(ka[i], kb[i], ascending);
      if (result) return result;
    }
    // Ties (e.g. many students with no award) fall back to name, A–Z.
    const [na, nb] = [nameOrder(a), nameOrder(b)];
    for (let i = 0; i < na.length; i++) {
      const result = compareValues(na[i], nb[i], true);
      if (result) return result;
    }
    return a.id.localeCompare(b.id);
  });

  const pageIds = matches.slice(from, from + size).map((r) => r.id);
  if (pageIds.length === 0) return { rows: [] as AcademicRecordRow[], total: matches.length, page, size };

  const { data, error } = await supabase
    .from(T.academicRecords)
    .select(select)
    .eq("org_id", ORG_ID)
    .in("id", pageIds);
  if (error) throw new Error(error.message);

  const byId = new Map(((data ?? []) as unknown as AcademicRecordRow[]).map((r) => [r.id, r]));
  const rows = pageIds.map((id) => byId.get(id)).filter((r): r is AcademicRecordRow => !!r);
  return { rows, total: matches.length, page, size };
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
