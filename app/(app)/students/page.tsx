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
  // No year in the URL → the active year, except while searching: a search
  // should find the student wherever they are, so it spans every year unless
  // one is picked. An explicit "All years" arrives as `academic_year_id=all`
  // (parseFilters drops it), which must not fall back to the active year.
  const yearDefault = searchParams.academic_year_id || filters.q ? null : activeYearId(lookups);
  if (!filters.academic_year_id && yearDefault) filters.academic_year_id = yearDefault;

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
      yearDefault={yearDefault}
      exportQuery={exportParams.toString() ? `?${exportParams.toString()}` : ""}
    />
  );
}
