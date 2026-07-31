import { createClient } from "@/lib/supabase/server";
import { ORG_ID } from "@/lib/constants";
import { T } from "@/lib/tables";

export type DashboardStats = {
  students: number;
  schoolStudents: number;
  collegeStudents: number;
  institutions: number;
  awards: number;
  allocations: number;
  distributed: number;
  pendingDistribution: number;
  queuedOffline: number;
  giftStock: number;
  ungraded: number;
  byCategory: { name: string; count: number }[];
  byInstitution: { name: string; type: string; count: number }[];
  recentAudit: {
    id: number;
    entity_name: string;
    action: string;
    actor: string | null;
    created_at: string;
  }[];
};

/** All 13 queries run in one Promise.all — the page awaiting this must not
 *  also serially await getLookups() first; run them together. */
export async function getDashboardStats(academicYearId: string | null): Promise<DashboardStats> {
  const supabase = createClient();
  const countOpts = { count: "exact" as const, head: true };

  const recordsBase = () => {
    let q = supabase.from(T.academicRecords).select("id", countOpts).eq("org_id", ORG_ID);
    if (academicYearId) q = q.eq("academic_year_id", academicYearId);
    return q;
  };

  const recordsByInstitutionType = (type: "school" | "college") => {
    let q = supabase
      .from(T.academicRecords)
      .select("id, institutions:am_institutions!inner(type)", countOpts)
      .eq("org_id", ORG_ID)
      .eq("institutions.type", type);
    if (academicYearId) q = q.eq("academic_year_id", academicYearId);
    return q;
  };

  const [
    records,
    school,
    college,
    institutions,
    awards,
    allocations,
    distributed,
    pending,
    queued,
    gifts,
    ungraded,
    categoryRows,
    institutionRows,
    audit,
  ] = await Promise.all([
    recordsBase(),
    recordsByInstitutionType("school"),
    recordsByInstitutionType("college"),
    supabase.from(T.institutions).select("id", countOpts).eq("org_id", ORG_ID),
    academicYearId
      ? supabase
          .from(T.studentAwards)
          .select("id, academic_records:am_academic_records!inner(academic_year_id)", countOpts)
          .eq("org_id", ORG_ID)
          .eq("academic_records.academic_year_id", academicYearId)
      : supabase.from(T.studentAwards).select("id", countOpts).eq("org_id", ORG_ID),
    supabase.from(T.giftAllocations).select("id", countOpts).eq("org_id", ORG_ID),
    supabase
      .from(T.distributionRecords)
      .select("id", countOpts)
      .eq("org_id", ORG_ID)
      .eq("status", "distributed"),
    supabase
      .from(T.distributionRecords)
      .select("id", countOpts)
      .eq("org_id", ORG_ID)
      .eq("status", "pending"),
    supabase
      .from(T.distributionRecords)
      .select("id", countOpts)
      .eq("org_id", ORG_ID)
      .eq("sync_status", "queued_offline"),
    supabase.from(T.giftItems).select("quantity_on_hand").eq("org_id", ORG_ID),
    recordsBase().is("percentage", null),
    supabase
      .from(T.studentAwards)
      .select("award_categories:am_award_categories(name)")
      .eq("org_id", ORG_ID)
      .limit(5000),
    supabase
      .from(T.academicRecords)
      .select("institutions:am_institutions!inner(name,type)")
      .eq("org_id", ORG_ID)
      .eq(academicYearId ? "academic_year_id" : "org_id", academicYearId ?? ORG_ID)
      .limit(5000),
    supabase
      .from(T.auditLogs)
      .select("id,entity_name,action,actor,created_at")
      .eq("org_id", ORG_ID)
      .order("created_at", { ascending: false })
      .limit(8),
  ]);

  const byCategory = tally(
    ((categoryRows.data ?? []) as unknown as {
      award_categories: { name: string } | null;
    }[]).map((r) => r.award_categories?.name ?? "—"),
  );

  const institutionTally = new Map<string, { name: string; type: string; count: number }>();
  for (const row of (institutionRows.data ?? []) as unknown as {
    institutions: { name: string; type: string } | null;
  }[]) {
    const inst = row.institutions;
    if (!inst) continue;
    const existing = institutionTally.get(inst.name);
    if (existing) existing.count += 1;
    else institutionTally.set(inst.name, { name: inst.name, type: inst.type, count: 1 });
  }

  return {
    students: records.count ?? 0,
    schoolStudents: school.count ?? 0,
    collegeStudents: college.count ?? 0,
    institutions: institutions.count ?? 0,
    awards: awards.count ?? 0,
    allocations: allocations.count ?? 0,
    distributed: distributed.count ?? 0,
    pendingDistribution: pending.count ?? 0,
    queuedOffline: queued.count ?? 0,
    giftStock: (gifts.data ?? []).reduce((sum, g) => sum + (g.quantity_on_hand ?? 0), 0),
    ungraded: ungraded.count ?? 0,
    byCategory,
    byInstitution: [...institutionTally.values()].sort((a, b) => b.count - a.count).slice(0, 8),
    recentAudit: audit.data ?? [],
  };
}

function tally(values: string[]) {
  const map = new Map<string, number>();
  for (const v of values) map.set(v, (map.get(v) ?? 0) + 1);
  return [...map.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count);
}
