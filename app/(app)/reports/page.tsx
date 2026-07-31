import { activeYearId, getLookups } from "@/lib/data/lookups";
import { describeFilters, getReportRows, parseFilters } from "@/lib/data/reports";
import { ReportsClient } from "./reports-client";

export const metadata = { title: "Reports" };

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Record<string, string | undefined>;
}) {
  const lookups = await getLookups();

  const filters = parseFilters(searchParams);
  if (!filters.academic_year_id) {
    const active = activeYearId(lookups);
    if (active) filters.academic_year_id = active;
  }

  const [rows, filterDescription] = await Promise.all([
    getReportRows(filters),
    describeFilters(filters),
  ]);

  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value !== undefined && value !== null && key !== "page" && key !== "size") {
      params.set(key, String(value));
    }
  }

  return (
    <ReportsClient
      rows={rows}
      lookups={lookups}
      filterDescription={filterDescription}
      query={params.toString() ? `?${params.toString()}` : ""}
    />
  );
}
