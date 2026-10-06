"use server";

import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/supabase/server";
import { ORG_ID } from "@/lib/constants";
import { writeAudit } from "@/lib/audit";
import { friendly, message } from "@/lib/actions/crud";
import { T } from "@/lib/tables";
import {
  BAND_CATEGORY_NAMES,
  BAND_ORDER,
  RULE_MAX_LEVEL,
  bandFor,
  isBlankGrade,
  type AwardBand,
} from "@/lib/awards/percentage-rule";
import { COLLEGE_RANK_FLOOR, rankCourseGroup } from "@/lib/awards/college-rank-rule";
import { type AwardRuleKey } from "@/lib/awards/rules";
import { placementLabel } from "@/lib/placement";
import type { ActionResult } from "@/lib/types";

export type AssignmentSummary = {
  /** Every record the chosen rule looked at. */
  eligible: number;
  /** Students who get a rank/consolation award they don't have yet. */
  toCreate: number;
  /** Existing rank/consolation awards switched to a different one. */
  toChange: number;
  /** Extra rank/consolation awards on one student, removed so only one remains. */
  toRemove: number;
  /** Already correct. */
  unchanged: number;
  /** Left alone for staff to decide — a grade but no percentage to rank/band by. */
  skipped: { count: number; students: { name: string; group: string; grade: string | null }[] };
  /** How many students end up in each band once applied. */
  byBand: Record<AwardBand, number>;
};

/** One record's outcome under whichever rule is running — the shape buildPlan's
 *  diff logic works from, regardless of how school vs. college arrived at `band`. */
type Candidate = {
  id: string; // academic_record_id
  band: AwardBand | "skip";
  studentName: string;
  /** Standard label (school) or course name (college) — only shown in the skipped list. */
  groupLabel: string;
  grade: string | null;
  studentAwards: { id: string; award_category_id: string }[] | null;
};

const FETCH_CHUNK = 1000; // PostgREST's default max-rows per request
const WRITE_CHUNK = 100; // keeps `.in("id", …)` URLs comfortably short

function chunks<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

type Supa = Awaited<ReturnType<typeof requirePermission>>["supabase"];

type OrphanRow = {
  id: string;
  students: { first_name: string; middle_name: string | null; last_name: string } | null;
};

/** Records that *used* to have a placement but no longer do — almost always
 *  because the Standard/Course they were on got deleted (the FK is `on delete
 *  set null`, so the record itself survives with a gap where the group used
 *  to be). Without this, such a record is invisible to its rule entirely (the
 *  main query requires a non-null group to rank within) and any award it
 *  already had would sit there unverified forever. Surfaced as "skip" so a
 *  human notices and re-places them, same as a grade-only record. */
async function collectOrphanedCandidates(
  supabase: Supa,
  academicYearId: string,
  institutionType: "school" | "college",
  nullColumn: "standard_id" | "course_id",
  groupLabel: string,
): Promise<Candidate[]> {
  const rows = await fetchAll<OrphanRow>((from, to) =>
    supabase
      .from(T.academicRecords)
      .select(
        `id, students:am_students!inner ( first_name, middle_name, last_name ),
         institutions:am_institutions!inner ( type )`,
      )
      .eq("org_id", ORG_ID)
      .eq("academic_year_id", academicYearId)
      .eq("institutions.type", institutionType)
      .is(nullColumn, null)
      .order("id")
      .range(from, to),
  );

  return rows.map((row) => ({
    id: row.id,
    band: "skip" as const,
    studentName: [row.students?.first_name, row.students?.last_name].filter(Boolean).join(" ") || "—",
    groupLabel,
    grade: null,
    studentAwards: null,
  }));
}

/** Pages through a query in FETCH_CHUNK-sized batches (PostgREST's own cap per
 *  request). `query` is loosely typed because Supabase infers a slightly
 *  different (but compatible) shape for embedded relations than the plain
 *  row type callers want to work with — same cast every row-fetcher already
 *  needed before this was pulled out into one place. */
async function fetchAll<T>(
  query: (from: number, to: number) => PromiseLike<{ data: unknown; error: { message: string } | null }>,
): Promise<T[]> {
  const rows: T[] = [];
  for (let start = 0; ; start += FETCH_CHUNK) {
    const { data, error } = await query(start, start + FETCH_CHUNK - 1);
    if (error) throw new Error(friendly(error.message));
    const chunk = (data ?? []) as T[];
    rows.push(...chunk);
    if (chunk.length < FETCH_CHUNK) break;
  }
  return rows;
}

type SchoolRow = {
  id: string;
  percentage: number | null;
  grade: string | null;
  students: { first_name: string; middle_name: string | null; last_name: string } | null;
  standards: { level: number; label: string } | null;
  student_awards: { id: string; award_category_id: string }[] | null;
};

/** School rule ("school_percentage"): every school record from Play Group to
 *  Std 12, one band per row via bandFor() — see lib/awards/percentage-rule.ts. */
async function collectSchoolCandidates(supabase: Supa, academicYearId: string): Promise<Candidate[]> {
  const rows = await fetchAll<SchoolRow>((from, to) =>
    supabase
      .from(T.academicRecords)
      .select(
        `id, percentage, grade,
         students:am_students!inner ( first_name, middle_name, last_name ),
         institutions:am_institutions!inner ( type ),
         standards:am_standards!inner ( level, label ),
         student_awards:am_student_awards ( id, award_category_id )`,
      )
      .eq("org_id", ORG_ID)
      .eq("academic_year_id", academicYearId)
      .eq("institutions.type", "school")
      .lte("standards.level", RULE_MAX_LEVEL)
      .order("id")
      .range(from, to),
  );

  const placed: Candidate[] = rows.map((row) => ({
    id: row.id,
    band: bandFor(row.percentage === null ? null : Number(row.percentage), row.grade, row.standards?.level ?? RULE_MAX_LEVEL),
    studentName: [row.students?.first_name, row.students?.last_name].filter(Boolean).join(" ") || "—",
    groupLabel: row.standards?.label ?? "—",
    grade: row.grade,
    studentAwards: row.student_awards,
  }));
  const orphaned = await collectOrphanedCandidates(supabase, academicYearId, "school", "standard_id", "No standard set");
  return [...placed, ...orphaned];
}

type CollegeRow = {
  id: string;
  percentage: number | null;
  grade: string | null;
  course_id: string | null;
  period_no: number | null;
  students: { first_name: string; middle_name: string | null; last_name: string } | null;
  courses: { name: string; structure_type: "year" | "semester" } | null;
  student_awards: { id: string; award_category_id: string }[] | null;
};

/** College rule ("college_rank_1", a.k.a. "Rule 1"): every college record with
 *  a matched course (a custom "Other" course can't be grouped, so it's
 *  skipped like a grade-only school record is). Grouped by course *and*
 *  year/semester — BCom Year 1 is judged separately from BCom Year 2, per the
 *  conversation that designed this — then ranked within each group by
 *  rankCourseGroup(). See lib/awards/college-rank-rule.ts. */
async function collectCollegeCandidates(supabase: Supa, academicYearId: string): Promise<Candidate[]> {
  const rows = await fetchAll<CollegeRow>((from, to) =>
    supabase
      .from(T.academicRecords)
      .select(
        `id, percentage, grade, course_id, period_no,
         students:am_students!inner ( first_name, middle_name, last_name ),
         institutions:am_institutions!inner ( type ),
         courses:am_courses ( name, structure_type ),
         student_awards:am_student_awards ( id, award_category_id )`,
      )
      .eq("org_id", ORG_ID)
      .eq("academic_year_id", academicYearId)
      .eq("institutions.type", "college")
      .not("course_id", "is", null)
      .order("id")
      .range(from, to),
  );

  const byCoursePeriod = new Map<string, CollegeRow[]>();
  for (const row of rows) {
    const key = `${row.course_id}:${row.period_no ?? "none"}`;
    const list = byCoursePeriod.get(key);
    if (list) list.push(row);
    else byCoursePeriod.set(key, [row]);
  }

  const candidates: Candidate[] = [];
  for (const group of byCoursePeriod.values()) {
    const rankable = group.filter((r) => r.percentage !== null && Number(r.percentage) > COLLEGE_RANK_FLOOR);
    const ranks = rankCourseGroup(rankable.map((r) => ({ id: r.id, percentage: Number(r.percentage) })));

    for (const row of group) {
      const band: AwardBand | "skip" =
        row.percentage !== null
          ? (ranks.get(row.id) ?? "consolation") // ranked above the floor, or at/below it
          : isBlankGrade(row.grade)
            ? "consolation"
            : "skip";
      candidates.push({
        id: row.id,
        band,
        studentName: [row.students?.first_name, row.students?.last_name].filter(Boolean).join(" ") || "—",
        groupLabel: placementLabel(row),
        grade: row.grade,
        studentAwards: row.student_awards,
      });
    }
  }
  const orphaned = await collectOrphanedCandidates(supabase, academicYearId, "college", "course_id", "No course set");
  return [...candidates, ...orphaned];
}

/** The four rule-driven categories' ids, keyed by band — shared by buildPlan
 *  (to compare/assign them) and clearBandAwards (to know which award rows
 *  count as "rule-driven" and are therefore safe to clear automatically). */
export async function resolveBandCategoryIds(supabase: Supa): Promise<Record<AwardBand, string>> {
  const { data: categories, error: catError } = await supabase
    .from(T.awardCategories)
    .select("id, name")
    .eq("org_id", ORG_ID);
  if (catError) throw new Error(friendly(catError.message));

  const idByName = new Map((categories ?? []).map((c) => [String(c.name).trim().toLowerCase(), c.id as string]));
  const categoryId = {} as Record<AwardBand, string>;
  const missing: string[] = [];
  for (const band of BAND_ORDER) {
    const id = idByName.get(BAND_CATEGORY_NAMES[band].toLowerCase());
    if (id) categoryId[band] = id;
    else missing.push(BAND_CATEGORY_NAMES[band]);
  }
  if (missing.length > 0) {
    throw new Error(`Add these award categories in Settings first: ${missing.join(", ")}`);
  }
  return categoryId;
}

/** Deletes any of the four rule-driven awards (1st/2nd/3rd Rank, Consolation)
 *  on the given academic records — called wherever a record's course/standard/
 *  period/percentage/grade changes in a way that could invalidate whichever
 *  band it was last placed in, so a now-possibly-wrong award is never left
 *  sitting there looking valid. The next "Assign Awards" run fills it back in
 *  correctly (or leaves it blank if the record can no longer be placed at
 *  all — see the "no course/standard set" skip entries in buildPlan). A
 *  manually-assigned award outside these four categories is never touched. */
export async function clearBandAwards(supabase: Supa, actor: string, academicRecordIds: string[]): Promise<number> {
  if (academicRecordIds.length === 0) return 0;
  const categoryId = await resolveBandCategoryIds(supabase);
  const bandCategoryIds = Object.values(categoryId);

  let cleared = 0;
  for (const ids of chunks(academicRecordIds, WRITE_CHUNK)) {
    const { data, error } = await supabase
      .from(T.studentAwards)
      .delete()
      .in("academic_record_id", ids)
      .in("award_category_id", bandCategoryIds)
      .eq("org_id", ORG_ID)
      .select("id");
    if (error) throw new Error(friendly(error.message));
    cleared += data?.length ?? 0;
  }

  if (cleared > 0) {
    await writeAudit(supabase, {
      entity: "student_awards",
      entityId: null,
      action: "delete",
      actor,
      diff: { cleared_stale_band_awards: { academic_record_ids: academicRecordIds, count: cleared } },
    });
  }
  return cleared;
}

/** Works out what the chosen rule would do, without changing anything — the
 *  same plan drives both the preview and the real run, so the numbers shown
 *  before confirming are exactly what the run then does. */
async function buildPlan(supabase: Supa, academicYearId: string, ruleKey: AwardRuleKey) {
  const categoryId = await resolveBandCategoryIds(supabase);
  const bandByCategoryId = new Map(BAND_ORDER.map((b) => [categoryId[b], b]));

  const candidates =
    ruleKey === "school_percentage"
      ? await collectSchoolCandidates(supabase, academicYearId)
      : await collectCollegeCandidates(supabase, academicYearId);

  const inserts: { org_id: string; academic_record_id: string; award_category_id: string }[] = [];
  const updates: { id: string; to: string }[] = [];
  const deletes: string[] = [];
  const byBand: Record<AwardBand, number> = { first: 0, second: 0, third: 0, consolation: 0 };
  const skippedStudents: AssignmentSummary["skipped"]["students"] = [];
  const SKIPPED_SHOWN = 30;
  let skippedCount = 0;
  let unchanged = 0;

  for (const c of candidates) {
    const band = c.band;
    if (band === "skip") {
      skippedCount += 1;
      if (skippedStudents.length < SKIPPED_SHOWN) {
        skippedStudents.push({ name: c.studentName, group: c.groupLabel, grade: c.grade });
      }
      continue;
    }
    byBand[band] += 1;

    const existing = (c.studentAwards ?? []).filter((a) => bandByCategoryId.has(a.award_category_id));
    const correct = existing.find((a) => a.award_category_id === categoryId[band]);
    if (correct) {
      unchanged += existing.length === 1 ? 1 : 0;
      for (const extra of existing) if (extra.id !== correct.id) deletes.push(extra.id);
    } else if (existing.length > 0) {
      const [keep, ...extras] = existing;
      updates.push({ id: keep.id, to: categoryId[band] });
      for (const extra of extras) deletes.push(extra.id);
    } else {
      inserts.push({ org_id: ORG_ID, academic_record_id: c.id, award_category_id: categoryId[band] });
    }
  }

  const summary: AssignmentSummary = {
    eligible: candidates.length,
    toCreate: inserts.length,
    toChange: updates.length,
    toRemove: deletes.length,
    unchanged,
    skipped: { count: skippedCount, students: skippedStudents },
    byBand,
  };
  return { summary, inserts, updates, deletes };
}

/** All three permissions: the run can add awards, switch existing ones and
 *  remove duplicates, so it needs the whole set rather than just Create. */
async function requireAwardManagement() {
  await requirePermission("awards", "create");
  await requirePermission("awards", "update");
  return requirePermission("awards", "delete");
}

/** Read-only: what "Assign Awards" would do for this year under the given rule. */
export async function previewAwardAssignment(
  academicYearId: string,
  ruleKey: AwardRuleKey,
): Promise<ActionResult<AssignmentSummary>> {
  try {
    const { supabase } = await requireAwardManagement();
    const { summary } = await buildPlan(supabase, academicYearId, ruleKey);
    return { ok: true, data: summary };
  } catch (e) {
    return { ok: false, error: message(e) };
  }
}

/** Applies the chosen rule to every record it covers for the year. Safe to run
 *  repeatedly: it only touches the four rank/consolation awards, switches an
 *  existing one in place (so gifts and distribution already tied to it
 *  survive) and leaves any other award category alone. */
export async function applyAwardAssignment(
  academicYearId: string,
  ruleKey: AwardRuleKey,
): Promise<ActionResult<AssignmentSummary>> {
  try {
    const { supabase, actor } = await requireAwardManagement();
    const { summary, inserts, updates, deletes } = await buildPlan(supabase, academicYearId, ruleKey);

    // Removals first, so a switch below can never collide on the
    // one-award-per-category-per-record rule.
    for (const ids of chunks(deletes, WRITE_CHUNK)) {
      const { data, error } = await supabase
        .from(T.studentAwards)
        .delete()
        .in("id", ids)
        .eq("org_id", ORG_ID)
        .select("id");
      if (error || (data?.length ?? 0) !== ids.length) {
        return { ok: false, error: `${error ? friendly(error.message) : "Some awards could not be removed"} — run it again to finish.` };
      }
    }

    const byTarget = new Map<string, string[]>();
    for (const u of updates) byTarget.set(u.to, [...(byTarget.get(u.to) ?? []), u.id]);
    for (const [target, ids] of byTarget) {
      for (const part of chunks(ids, WRITE_CHUNK)) {
        const { data, error } = await supabase
          .from(T.studentAwards)
          .update({ award_category_id: target })
          .in("id", part)
          .eq("org_id", ORG_ID)
          .select("id");
        if (error || (data?.length ?? 0) !== part.length) {
          return { ok: false, error: `${error ? friendly(error.message) : "Some awards could not be updated"} — run it again to finish.` };
        }
      }
    }

    for (const part of chunks(inserts, WRITE_CHUNK * 5)) {
      const { error } = await supabase.from(T.studentAwards).insert(part);
      if (error) return { ok: false, error: `${friendly(error.message)} — run it again to finish.` };
    }

    // One summary entry rather than a row per award — a run touches hundreds.
    await writeAudit(supabase, {
      entity: "student_awards",
      entityId: null,
      action: "update",
      actor,
      diff: {
        assigned_by_rule: {
          rule: ruleKey,
          academic_year_id: academicYearId,
          created: summary.toCreate,
          changed: summary.toChange,
          removed: summary.toRemove,
          unchanged: summary.unchanged,
          skipped: summary.skipped.count,
          by_band: summary.byBand,
        },
      },
    });

    for (const path of ["/awards", "/students", "/reports", "/dashboard", "/distribution"]) revalidatePath(path);
    return { ok: true, data: summary };
  } catch (e) {
    return { ok: false, error: message(e) };
  }
}
