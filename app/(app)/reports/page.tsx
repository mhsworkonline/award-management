import { activeYearId, getLookups } from "@/lib/data/lookups";
import { describeFilters, getReportRows, parseFilters } from "@/lib/data/reports";
import { getApplicationsByStandard, getApprovedSubmissionsList } from "@/lib/data/submission-reports";
import type { StandardReport, SubmissionListRow } from "@/lib/data/submission-reports";
import { getOrganization } from "@/lib/actions/organization";
import { ReportsClient, type ReportsView } from "./reports-client";

export const metadata = { title: "Reports" };

const EMPTY_STANDARD_REPORT: StandardReport = { categories: [], rows: [] };

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Record<string, string | undefined>;
}) {
  const lookups = await getLookups();
  const view: ReportsView =
    searchParams.view === "standards" ? "standards" : searchParams.view === "submissions" ? "submissions" : "roster";

  // The two submission-based reports are always scoped to exactly one year —
  // default to the active one, same convention as the roster report.
  const yearId = searchParams.academic_year_id ?? activeYearId(lookups) ?? null;

  // Whether the "Include logo" toggle has anything to include — same
  // graceful-degrade-on-missing-permission behavior the PDF routes already
  // have for the org name (Settings:Read, not Reports:Read) — a role that
  // can't read it just doesn't get the toggle enabled.
  const org = await getOrganization();
  const hasLogo = org.ok ? !!org.data.logo_path : false;

  if (view === "standards") {
    const standardReport = yearId ? await getApplicationsByStandard(yearId) : EMPTY_STANDARD_REPORT;
    return (
      <ReportsClient
        view="standards"
        rows={[]}
        lookups={lookups}
        filterDescription=""
        query=""
        yearId={yearId}
        standardReport={standardReport}
        submissionRows={[]}
        hasLogo={hasLogo}
      />
    );
  }

  if (view === "submissions") {
    const submissionRows: SubmissionListRow[] = yearId ? await getApprovedSubmissionsList(yearId) : [];
    return (
      <ReportsClient
        view="submissions"
        rows={[]}
        lookups={lookups}
        filterDescription=""
        query=""
        yearId={yearId}
        standardReport={EMPTY_STANDARD_REPORT}
        submissionRows={submissionRows}
        hasLogo={hasLogo}
      />
    );
  }

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
      view="roster"
      rows={rows}
      lookups={lookups}
      filterDescription={filterDescription}
      query={params.toString() ? `?${params.toString()}` : ""}
      yearId={yearId}
      standardReport={EMPTY_STANDARD_REPORT}
      submissionRows={[]}
      hasLogo={hasLogo}
    />
  );
}
