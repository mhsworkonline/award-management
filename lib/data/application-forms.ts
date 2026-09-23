import { createClient } from "@/lib/supabase/server";
import { ORG_ID } from "@/lib/constants";
import { T } from "@/lib/tables";
import type { ApplicationFormRow } from "@/lib/types";

/** Application-type forms track their submissions directly (form_id on
 *  am_public_submissions — a visitor goes through one specific form URL).
 *  Confirm-type forms don't work that way (the code+phone lookup doesn't
 *  care which URL got them there), so their count is approximated by
 *  matching academic year instead — accurate as long as there's the one
 *  confirm form per year the feature was actually designed around. */
export async function listApplicationForms() {
  const supabase = createClient();

  const [forms, submissions, confirmations] = await Promise.all([
    supabase
      .from(T.applicationForms)
      .select("*, academic_years:am_academic_years ( id, label )")
      .eq("org_id", ORG_ID)
      .order("created_at", { ascending: false }),
    supabase.from(T.publicSubmissions).select("form_id").eq("org_id", ORG_ID).limit(50000),
    supabase
      .from(T.dataConfirmations)
      .select("academic_records:am_academic_records ( academic_year_id )")
      .eq("org_id", ORG_ID)
      .limit(50000),
  ]);

  if (forms.error) throw new Error(forms.error.message);

  const counts = new Map<string, number>();
  for (const row of submissions.data ?? []) {
    if (!row.form_id) continue;
    counts.set(row.form_id, (counts.get(row.form_id) ?? 0) + 1);
  }

  const confirmationCountsByYear = new Map<string, number>();
  for (const row of (confirmations.data ?? []) as unknown as { academic_records: { academic_year_id: string } | null }[]) {
    const yearId = row.academic_records?.academic_year_id;
    if (!yearId) continue;
    confirmationCountsByYear.set(yearId, (confirmationCountsByYear.get(yearId) ?? 0) + 1);
  }

  return ((forms.data ?? []) as unknown as ApplicationFormRow[]).map((f) => ({
    ...f,
    submission_count:
      f.form_type === "confirm" ? (confirmationCountsByYear.get(f.academic_year_id) ?? 0) : (counts.get(f.id) ?? 0),
  }));
}
