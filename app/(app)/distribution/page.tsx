import { activeYearId, getLookups } from "@/lib/data/lookups";
import { listDistribution } from "@/lib/data/distribution";
import { DistributionClient } from "./distribution-client";
import type { DistributionStatus } from "@/lib/types";

export const metadata = { title: "Distribution" };

export default async function DistributionPage({
  searchParams,
}: {
  searchParams: Record<string, string | undefined>;
}) {
  const lookups = await getLookups();
  const yearId = searchParams.academic_year_id ?? activeYearId(lookups) ?? undefined;

  const status =
    searchParams.status === "pending" || searchParams.status === "distributed"
      ? (searchParams.status as DistributionStatus)
      : undefined;

  let rows: Awaited<ReturnType<typeof listDistribution>> = [];
  try {
    rows = await listDistribution({
      academic_year_id: yearId,
      institution_id: searchParams.institution_id,
      award_category_id: searchParams.award_category_id,
      status,
      q: searchParams.q,
    });
  } catch {
    // Supabase unreachable — the client falls back to its IndexedDB cache.
    rows = [];
  }

  const pdfParams = new URLSearchParams();
  if (yearId) pdfParams.set("academic_year_id", yearId);
  if (searchParams.institution_id) pdfParams.set("institution_id", searchParams.institution_id);
  if (searchParams.award_category_id) {
    pdfParams.set("award_category_id", searchParams.award_category_id);
  }
  pdfParams.set("signature", "on");

  return (
    <DistributionClient
      rows={rows}
      lookups={lookups}
      pdfQuery={`?${pdfParams.toString()}`}
    />
  );
}
