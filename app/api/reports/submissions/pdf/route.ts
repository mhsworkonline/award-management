import { requireUser } from "@/lib/supabase/server";
import { getApprovedSubmissionsList } from "@/lib/data/submission-reports";
import {
  DEFAULT_SUBMISSION_LIST_COLUMNS,
  SUBMISSION_LIST_COLUMNS,
  type SubmissionColumnKey,
} from "@/lib/data/submission-report-columns";
import { renderSubmissionsListPdf } from "@/lib/pdf/submissions-list";
import { resolveReportBranding } from "@/lib/pdf/report-branding";
import { T } from "@/lib/tables";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

function parseColumns(url: URL): SubmissionColumnKey[] {
  const raw = url.searchParams.get("columns");
  if (!raw) return DEFAULT_SUBMISSION_LIST_COLUMNS;
  const valid = new Set(SUBMISSION_LIST_COLUMNS.map((c) => c.key));
  const picked = raw.split(",").filter((k): k is SubmissionColumnKey => valid.has(k as SubmissionColumnKey));
  return picked.length > 0 ? picked : DEFAULT_SUBMISSION_LIST_COLUMNS;
}

export async function GET(request: Request) {
  try {
    const { supabase } = await requireUser();
    const url = new URL(request.url);
    const academicYearId = url.searchParams.get("academic_year_id");
    if (!academicYearId) return new Response("Missing academic_year_id", { status: 400 });
    const columns = parseColumns(url);
    const includeLogo = url.searchParams.get("logo") === "on";
    const customTitle = url.searchParams.get("title")?.trim() || null;

    const [rows, year, branding] = await Promise.all([
      getApprovedSubmissionsList(academicYearId),
      supabase.from(T.academicYears).select("label").eq("id", academicYearId).maybeSingle(),
      resolveReportBranding(supabase, includeLogo),
    ]);

    const buffer = await renderSubmissionsListPdf({
      rows,
      columns,
      academicYearLabel: year.data?.label ?? "—",
      organizationName: branding.organizationName,
      logoUrl: branding.logoUrl,
      customTitle,
    });

    const stamp = new Date().toISOString().slice(0, 10);
    return new Response(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="approved-applications-${stamp}.pdf"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "PDF generation failed";
    return new Response(msg, { status: msg === "Not authenticated" ? 401 : 500 });
  }
}
