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
  type AwardBand,
} from "@/lib/awards/percentage-rule";
import type { ActionResult } from "@/lib/types";

export type AssignmentSummary = {
  /** School records (Play Group to Std 12) in the year — everyone the rule looked at. */
  eligible: number;
  /** Students who get a rank/consolation award they don't have yet. */
  toCreate: number;
  /** Existing rank/consolation awards switched to a different one. */
  toChange: number;
  /** Extra rank/consolation awards on one student, removed so only one remains. */
  toRemove: number;
  /** Already correct. */
  unchanged: number;
  /** Grade but no percentage — left alone for staff to decide. */
  skipped: { count: number; students: { name: string; standard: string; grade: string | null }[] };
  /** How many students end up in each band once applied. */
  byBand: Record<AwardBand, number>;
};

type PlanRow = {
  id: string;
  percentage: number | null;
  grade: string | null;
  students: { first_name: string; middle_name: string | null; last_name: string } | null;
  standards: { level: number; label: string } | null;
  student_awards: { id: string; award_category_id: string }[] | null;
};

const FETCH_CHUNK = 1000; // PostgREST's default max-rows per request
const WRITE_CHUNK = 100; // keeps `.in("id", …)` URLs comfortably short
const SKIPPED_SHOWN = 30;

function chunks<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/** Works out what the rule would do, without changing anything — the same plan
 *  drives both the preview and the real run, so the numbers shown before
 *  confirming are exactly what the run then does. */
async function buildPlan(
  supabase: Awaited<ReturnType<typeof requirePermission>>["supabase"],
  academicYearId: string,
) {
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
  const bandByCategoryId = new Map(BAND_ORDER.map((b) => [categoryId[b], b]));

  const rows: PlanRow[] = [];
  for (let start = 0; ; start += FETCH_CHUNK) {
    const { data, error } = await supabase
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
      .range(start, start + FETCH_CHUNK - 1);
    if (error) throw new Error(friendly(error.message));
    const chunk = (data ?? []) as unknown as PlanRow[];
    rows.push(...chunk);
    if (chunk.length < FETCH_CHUNK) break;
  }

  const inserts: { org_id: string; academic_record_id: string; award_category_id: string }[] = [];
  const updates: { id: string; to: string; fromBand: AwardBand; toBand: AwardBand }[] = [];
  const deletes: string[] = [];
  const byBand: Record<AwardBand, number> = { first: 0, second: 0, third: 0, consolation: 0 };
  const skippedStudents: AssignmentSummary["skipped"]["students"] = [];
  let skippedCount = 0;
  let unchanged = 0;

  for (const row of rows) {
    const band = bandFor(
      row.percentage === null ? null : Number(row.percentage),
      row.grade,
      row.standards?.level ?? RULE_MAX_LEVEL,
    );
    if (band === "skip") {
      skippedCount += 1;
      if (skippedStudents.length < SKIPPED_SHOWN) {
        skippedStudents.push({
          name: [row.students?.first_name, row.students?.last_name].filter(Boolean).join(" ") || "—",
          standard: row.standards?.label ?? "—",
          grade: row.grade,
        });
      }
      continue;
    }
    byBand[band] += 1;

    const existing = (row.student_awards ?? []).filter((a) => bandByCategoryId.has(a.award_category_id));
    const correct = existing.find((a) => a.award_category_id === categoryId[band]);
    if (correct) {
      unchanged += existing.length === 1 ? 1 : 0;
      for (const extra of existing) if (extra.id !== correct.id) deletes.push(extra.id);
    } else if (existing.length > 0) {
      const [keep, ...extras] = existing;
      updates.push({ id: keep.id, to: categoryId[band], fromBand: bandByCategoryId.get(keep.award_category_id)!, toBand: band });
      for (const extra of extras) deletes.push(extra.id);
    } else {
      inserts.push({ org_id: ORG_ID, academic_record_id: row.id, award_category_id: categoryId[band] });
    }
  }

  const summary: AssignmentSummary = {
    eligible: rows.length,
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

/** Read-only: what "Assign Awards" would do for this year. */
export async function previewPercentageAwards(academicYearId: string): Promise<ActionResult<AssignmentSummary>> {
  try {
    const { supabase } = await requireAwardManagement();
    const { summary } = await buildPlan(supabase, academicYearId);
    return { ok: true, data: summary };
  } catch (e) {
    return { ok: false, error: message(e) };
  }
}

/** Applies the school award rule to every school record in the year (Play Group to Std 12).
 *  Safe to run repeatedly: it only touches the four rank/consolation awards,
 *  switches an existing one in place (so gifts and distribution already tied
 *  to it survive) and leaves any other award category alone. */
export async function applyPercentageAwards(academicYearId: string): Promise<ActionResult<AssignmentSummary>> {
  try {
    const { supabase, actor } = await requireAwardManagement();
    const { summary, inserts, updates, deletes } = await buildPlan(supabase, academicYearId);

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
        assigned_by_percentage_rule: {
          academic_year_id: academicYearId,
          created: summary.toCreate,
          changed: summary.toChange,
          removed: summary.toRemove,
          unchanged: summary.unchanged,
          skipped_grade_only: summary.skipped.count,
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
