import { createClient } from "@/lib/supabase/server";
import { ORG_ID } from "@/lib/constants";
import { FN, T } from "@/lib/tables";
import type { PublicSubmissionRow, SubmissionStatus } from "@/lib/types";

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

export async function getPendingSubmissionCount() {
  const supabase = createClient();
  const { count } = await supabase
    .from(T.publicSubmissions)
    .select("id", { count: "exact", head: true })
    .eq("org_id", ORG_ID)
    .eq("status", "pending");
  return count ?? 0;
}

/** Per-status counts for the Submissions page's tab headers — five cheap
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

  const [pending, approved, rejected, doubtful, all] = await Promise.all([
    countFor("pending"),
    countFor("approved"),
    countFor("rejected"),
    countFor("doubtful"),
    countFor(),
  ]);

  return {
    pending: pending.count ?? 0,
    approved: approved.count ?? 0,
    rejected: rejected.count ?? 0,
    doubtful: doubtful.count ?? 0,
    all: all.count ?? 0,
  };
}
