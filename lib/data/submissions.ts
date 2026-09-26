import { createClient } from "@/lib/supabase/server";
import { ORG_ID } from "@/lib/constants";
import { FN, T } from "@/lib/tables";
import type { PublicSubmissionRow, SubmissionNote, SubmissionStatus } from "@/lib/types";

/** Goes through a SECURITY DEFINER RPC (am_list_submissions), not a plain
 *  `.select()` with embedded joins — a role scoped to only Submissions:Read
 *  still needs the matched institution/standard/course/board/medium *names*
 *  to render, and those live on tables gated by their own module's read
 *  permission (Institutions, Settings). The RPC resolves those names itself
 *  (bypassing that other RLS) but re-checks Submissions:Read internally, so
 *  it can never be used to enumerate institutions/standards on their own —
 *  see the migration's comment for why that distinction matters. */
export async function listSubmissions(status: SubmissionStatus | "all" = "pending") {
  const supabase = createClient();
  const { data, error } = await supabase.rpc(FN.listSubmissions, {
    p_org_id: ORG_ID,
    p_status: status === "all" ? null : status,
  });
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as PublicSubmissionRow[];
}

/** Follow-up notes for the submissions in the tab being shown, grouped by
 *  submission id and oldest first. Loaded with the page so the review sheet
 *  has them the instant it opens — fetching them from inside the sheet went
 *  through a server action that took seconds, long enough to look like the
 *  note hadn't been saved. RLS applies (Submissions: Read). */
export async function listSubmissionNotesFor(
  status: SubmissionStatus | "all",
): Promise<Record<string, SubmissionNote[]>> {
  const supabase = createClient();
  let query = supabase
    .from(T.submissionNotes)
    .select("id, submission_id, note, created_by, created_at, submission:am_public_submissions!inner(status)")
    .eq("org_id", ORG_ID)
    .order("created_at", { ascending: true })
    .limit(5000);
  if (status !== "all") query = query.eq("submission.status", status);

  const { data } = await query;
  const bySubmission: Record<string, SubmissionNote[]> = {};
  for (const row of (data ?? []) as unknown as (SubmissionNote & { submission: unknown })[]) {
    const { submission: _joined, ...note } = row;
    (bySubmission[note.submission_id] ??= []).push(note);
  }
  return bySubmission;
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

/** Per-status counts for the Submissions page's tab headers — one aggregate
 *  query (am_submission_counts) instead of five separate head-only count
 *  requests. SECURITY INVOKER, so it still respects RLS exactly like the
 *  five queries it replaces — a role without Submissions:Read gets zeros. */
export async function getSubmissionCounts(): Promise<Record<SubmissionStatus | "all", number>> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc(FN.submissionCounts, { p_org_id: ORG_ID });
  if (error) throw new Error(error.message);

  const counts = data as Record<SubmissionStatus | "all", number> | null;
  return {
    pending: counts?.pending ?? 0,
    approved: counts?.approved ?? 0,
    rejected: counts?.rejected ?? 0,
    doubtful: counts?.doubtful ?? 0,
    all: counts?.all ?? 0,
  };
}
