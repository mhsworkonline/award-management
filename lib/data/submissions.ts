import { createClient } from "@/lib/supabase/server";
import { ORG_ID } from "@/lib/constants";
import { T } from "@/lib/tables";
import type { PublicSubmissionRow, SubmissionStatus } from "@/lib/types";

const SELECT = `
  *,
  institutions:am_institutions ( id, name, type ),
  academic_years:am_academic_years ( id, label ),
  standards:am_standards ( id, label ),
  streams:am_streams ( id, name ),
  courses:am_courses ( id, name, structure_type ),
  boards:am_boards ( id, name ),
  mediums:am_mediums ( id, name ),
  application_forms:am_application_forms ( id, title, slug ),
  attachments:am_submission_attachments ( id, submission_id, file_path, file_name, mime_type, size_bytes, created_at )
`;

export async function listSubmissions(status: SubmissionStatus | "all" = "pending") {
  const supabase = createClient();
  let query = supabase.from(T.publicSubmissions).select(SELECT).eq("org_id", ORG_ID);
  if (status !== "all") query = query.eq("status", status);

  const { data, error } = await query.order("created_at", { ascending: false }).limit(500);
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as PublicSubmissionRow[];
}

export async function getPendingSubmissionCount() {
  const supabase = createClient();
  const { count } = await supabase
    .from(T.publicSubmissions)
    .select("id", { count: "exact", head: true })
    .eq("org_id", ORG_ID)
    .eq("status", "pending");
  return count ?? 0;
}

/** Per-status counts for the Submissions page's tab headers — four cheap
 *  head-only count queries rather than fetching and tallying rows. */
export async function getSubmissionCounts(): Promise<Record<SubmissionStatus | "all", number>> {
  const supabase = createClient();
  const countFor = (status?: SubmissionStatus) => {
    let query = supabase
      .from(T.publicSubmissions)
      .select("id", { count: "exact", head: true })
      .eq("org_id", ORG_ID);
    if (status) query = query.eq("status", status);
    return query;
  };

  const [pending, approved, rejected, all] = await Promise.all([
    countFor("pending"),
    countFor("approved"),
    countFor("rejected"),
    countFor(),
  ]);

  return {
    pending: pending.count ?? 0,
    approved: approved.count ?? 0,
    rejected: rejected.count ?? 0,
    all: all.count ?? 0,
  };
}
