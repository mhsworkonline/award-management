import { createClient } from "@/lib/supabase/server";
import { ORG_ID } from "@/lib/constants";
import { T } from "@/lib/tables";
import type { ApplicationFormRow } from "@/lib/types";

export async function listApplicationForms() {
  const supabase = createClient();

  const [forms, submissions] = await Promise.all([
    supabase
      .from(T.applicationForms)
      .select("*, academic_years:am_academic_years ( id, label )")
      .eq("org_id", ORG_ID)
      .order("created_at", { ascending: false }),
    supabase.from(T.publicSubmissions).select("form_id").eq("org_id", ORG_ID).limit(50000),
  ]);

  if (forms.error) throw new Error(forms.error.message);

  const counts = new Map<string, number>();
  for (const row of submissions.data ?? []) {
    if (!row.form_id) continue;
    counts.set(row.form_id, (counts.get(row.form_id) ?? 0) + 1);
  }

  return ((forms.data ?? []) as unknown as ApplicationFormRow[]).map((f) => ({
    ...f,
    submission_count: counts.get(f.id) ?? 0,
  }));
}
