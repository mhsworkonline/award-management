import { getLookups } from "@/lib/data/lookups";
import { listSubmissions } from "@/lib/data/submissions";
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

  const [lookups, submissions] = await Promise.all([getLookups(), listSubmissions(status)]);

  return <SubmissionsClient submissions={submissions} lookups={lookups} status={status} />;
}
