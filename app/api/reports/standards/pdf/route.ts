import { requireUser } from "@/lib/supabase/server";
import { getApplicationsByStandard } from "@/lib/data/submission-reports";
import { parseInstitutionTypes } from "@/lib/data/submission-report-columns";
import { renderApplicationsByStandardPdf } from "@/lib/pdf/applications-by-standard";
import { resolveReportBranding } from "@/lib/pdf/report-branding";
import { parsePdfTextSize } from "@/lib/pdf/text-size";
import { T } from "@/lib/tables";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const { supabase } = await requireUser();
    const url = new URL(request.url);
    const academicYearId = url.searchParams.get("academic_year_id");
    if (!academicYearId) return new Response("Missing academic_year_id", { status: 400 });
    const includeLogo = url.searchParams.get("logo") === "on";
    const customTitle = url.searchParams.get("title")?.trim() || null;
    const textSize = parsePdfTextSize(url.searchParams.get("size"));

    const [report, year, branding] = await Promise.all([
      getApplicationsByStandard(academicYearId, parseInstitutionTypes(url.searchParams.get("types"))),
      supabase.from(T.academicYears).select("label").eq("id", academicYearId).maybeSingle(),
      resolveReportBranding(supabase, includeLogo),
    ]);

    const buffer = await renderApplicationsByStandardPdf({
      textSize,
      report,
      academicYearLabel: year.data?.label ?? "—",
      organizationName: branding.organizationName,
      logoUrl: branding.logoUrl,
      customTitle,
    });

    const stamp = new Date().toISOString().slice(0, 10);
    return new Response(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="applications-by-standard-${stamp}.pdf"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "PDF generation failed";
    return new Response(msg, { status: msg === "Not authenticated" ? 401 : 500 });
  }
}
