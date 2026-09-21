import { createClient } from "@/lib/supabase/server";
import { ORG_ID } from "@/lib/constants";
import type { Lookups } from "@/lib/types";
import { FN } from "@/lib/tables";

const EMPTY_LOOKUPS: Lookups = {
  academicYears: [],
  boards: [],
  mediums: [],
  courses: [],
  standards: [],
  streams: [],
  awardCategories: [],
  giftItems: [],
  institutions: [],
};

/** One round trip for every dropdown in the app — a single RPC (mirrors
 *  am_public_form_options' pattern for the public form) rather than 8
 *  separate HTTP calls. SECURITY INVOKER on the DB side, so each table's RLS
 *  still applies exactly as it did as 8 separate `.from().select()` calls —
 *  verified live: a role with only Institutions read gets institutions back
 *  and empty arrays for everything it can't read, not everything. */
export async function getLookups(): Promise<Lookups> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc(FN.getLookups, { p_org_id: ORG_ID });
  if (error || !data) return EMPTY_LOOKUPS;
  return data as unknown as Lookups;
}

/** The Submissions page's version of getLookups — same `Lookups` shape, but
 *  populated via a narrow SECURITY DEFINER RPC (am_get_submission_lookups)
 *  that only returns the six lists the review sheet's dropdowns use, gated
 *  on Submissions:Read. getLookups() itself stays SECURITY INVOKER on
 *  purpose, so a Submissions-only role would otherwise get blank dropdowns
 *  for anything behind the Institutions/Settings modules. Every key the
 *  RPC doesn't return (academic years, gift items, award categories) stays
 *  an empty array — the review sheet never reads them. */
export async function getSubmissionLookups(): Promise<Lookups> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc(FN.getSubmissionLookups, { p_org_id: ORG_ID });
  if (error || !data) return EMPTY_LOOKUPS;
  return { ...EMPTY_LOOKUPS, ...(data as unknown as Partial<Lookups>) };
}

/** The year used as the default filter everywhere. */
export function activeYearId(lookups: Lookups) {
  return lookups.academicYears.find((y) => y.is_active)?.id ?? lookups.academicYears[0]?.id ?? null;
}
