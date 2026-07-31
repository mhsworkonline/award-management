import { createClient } from "@/lib/supabase/server";
import { ORG_ID } from "@/lib/constants";
import type { Lookups } from "@/lib/types";
import { T } from "@/lib/tables";

/** One round trip for every dropdown in the app. Small tables, low churn. */
export async function getLookups(): Promise<Lookups> {
  const supabase = createClient();

  const [years, boards, mediums, courses, standards, categories, gifts, institutions] =
    await Promise.all([
      supabase.from(T.academicYears).select("*").eq("org_id", ORG_ID).order("label", { ascending: false }),
      supabase.from(T.boards).select("*").eq("org_id", ORG_ID).order("name"),
      supabase.from(T.mediums).select("*").eq("org_id", ORG_ID).order("name"),
      supabase.from(T.courses).select("*").eq("org_id", ORG_ID).order("name"),
      supabase.from(T.standards).select("*").eq("org_id", ORG_ID).order("level"),
      supabase.from(T.awardCategories).select("*").eq("org_id", ORG_ID).order("sort_order"),
      supabase.from(T.giftItems).select("*").eq("org_id", ORG_ID).order("name"),
      supabase
        .from(T.institutions)
        .select("id,name,type,board_id,medium_id")
        .eq("org_id", ORG_ID)
        .order("name"),
    ]);

  return {
    academicYears: years.data ?? [],
    boards: boards.data ?? [],
    mediums: mediums.data ?? [],
    courses: courses.data ?? [],
    standards: standards.data ?? [],
    awardCategories: categories.data ?? [],
    giftItems: gifts.data ?? [],
    institutions: institutions.data ?? [],
  };
}

/** The year used as the default filter everywhere. */
export function activeYearId(lookups: Lookups) {
  return lookups.academicYears.find((y) => y.is_active)?.id ?? lookups.academicYears[0]?.id ?? null;
}
