import { createClient } from "@/lib/supabase/server";
import { ORG_ID } from "@/lib/constants";
import { placementLabel } from "@/lib/placement";
import { studentFullName } from "@/lib/utils";
import { FN } from "@/lib/tables";
import type { DataConfirmation } from "@/lib/types";

export type ConfirmationRow = DataConfirmation & {
  student_name: string;
  institution_name: string | null;
  placement: string;
  academic_year_label: string | null;
};

type Raw = DataConfirmation & {
  academic_records: {
    id: string;
    period_no: number | null;
    students: { first_name: string; middle_name: string | null; last_name: string } | null;
    institutions: { name: string } | null;
    academic_years: { label: string } | null;
    standards: { label: string } | null;
    streams: { name: string } | null;
    courses: { name: string; structure_type: "year" | "semester" } | null;
  } | null;
};

/** Goes through a SECURITY DEFINER RPC (am_list_data_confirmations), not a
 *  plain `.select()` with embedded joins — same reason am_list_submissions
 *  does: a role scoped to only Submissions:Read still needs the matched
 *  student/institution/standard *names* to render, and those live on
 *  tables gated by their own module's read permission. */
export async function listDataConfirmations(): Promise<ConfirmationRow[]> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc(FN.listDataConfirmations, { p_org_id: ORG_ID });
  if (error) throw new Error(error.message);

  const rows = (data ?? []) as unknown as Raw[];
  return rows.map((r) => {
    const rec = r.academic_records;
    const student = rec?.students;
    return {
      ...r,
      student_name: student ? studentFullName({ first_name: student.first_name, middle_name: student.middle_name, last_name: student.last_name }) : "—",
      institution_name: rec?.institutions?.name ?? null,
      placement: rec ? placementLabel(rec) : "—",
      academic_year_label: rec?.academic_years?.label ?? null,
    };
  });
}
