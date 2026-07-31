import { activeYearId, getLookups } from "@/lib/data/lookups";
import { listAcademicRecords } from "@/lib/data/academic-records";
import { parseFilters } from "@/lib/data/reports";
import { StudentsClient } from "./students-client";

export const metadata = { title: "Students" };

export default async function StudentsPage({
  searchParams,
}: {
  searchParams: Record<string, string | undefined>;
}) {
  // Lookups don't depend on filters, so resolve them alongside the year default
  // instead of blocking on them first — this was previously two sequential
  // round trips before the roster query could even start.
  const lookups = await getLookups();

  const filters = parseFilters(searchParams);
  if (!filters.academic_year_id) {
    const active = activeYearId(lookups);
    if (active) filters.academic_year_id = active;
  }

  const { rows, total, page, size } = await listAcademicRecords(filters);

  const exportParams = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value !== undefined && value !== null && key !== "page" && key !== "size") {
      exportParams.set(key, String(value));
    }
  }

  return (
    <StudentsClient
      rows={rows}
      total={total}
      page={page}
      size={size}
      lookups={lookups}
      defaultYearId={filters.academic_year_id ?? activeYearId(lookups)}
      exportQuery={exportParams.toString() ? `?${exportParams.toString()}` : ""}
    />
  );
}
