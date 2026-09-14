import { getLookups } from "@/lib/data/lookups";
import { getSubmissionCounts, listSubmissions } from "@/lib/data/submissions";
import { SubmissionsClient } from "./submissions-client";
import type { SubmissionStatus } from "@/lib/types";

export const metadata = { title: "Submissions" };

export default async function SubmissionsPage({
  searchParams,
}: {
  searchParams: { status?: string };
}) {
  const status: SubmissionStatus | "all" =
    searchParams.status === "approved" || searchParams.status === "rejected" || searchParams.status === "all"
      ? (searchParams.status as SubmissionStatus | "all")
      : "pending";

  const [lookups, submissions, counts] = await Promise.all([
    getLookups(),
    listSubmissions(status),
    getSubmissionCounts(),
  ]);

  return <SubmissionsClient submissions={submissions} lookups={lookups} status={status} counts={counts} />;
}
