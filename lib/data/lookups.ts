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

/** The year used as the default filter everywhere. */
export function activeYearId(lookups: Lookups) {
  return lookups.academicYears.find((y) => y.is_active)?.id ?? lookups.academicYears[0]?.id ?? null;
}
