import { getSubmissionLookups } from "@/lib/data/lookups";
import { getSubmissionCounts, listSubmissionNotesFor, listSubmissions } from "@/lib/data/submissions";
import { SubmissionsClient } from "./submissions-client";
import type { SubmissionStatus } from "@/lib/types";

export const metadata = { title: "Submissions" };

export default async function SubmissionsPage({
  searchParams,
}: {
  searchParams: { status?: string };
}) {
  const VALID_STATUSES = ["approved", "rejected", "doubtful", "all"];
  const status: SubmissionStatus | "all" = VALID_STATUSES.includes(searchParams.status ?? "")
    ? (searchParams.status as SubmissionStatus | "all")
    : "pending";

  const [lookups, submissions, counts, notesBySubmission] = await Promise.all([
    getSubmissionLookups(),
    listSubmissions(status),
    getSubmissionCounts(),
    listSubmissionNotesFor(status),
  ]);

  return (
    <SubmissionsClient
      submissions={submissions}
      lookups={lookups}
      status={status}
      counts={counts}
      notesBySubmission={notesBySubmission}
    />
  );
}
