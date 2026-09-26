import { requireUser } from "@/lib/supabase/server";
import { describeFilters, getReportRows, parseFilters } from "@/lib/data/reports";
import { renderDistributionListPdf } from "@/lib/pdf/distribution-list";
import { resolveReportBranding } from "@/lib/pdf/report-branding";
import { parsePdfTextSize } from "@/lib/pdf/text-size";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const { supabase } = await requireUser();

    const url = new URL(request.url);
    const filters = parseFilters(url.searchParams);
    const groupByInstitution = url.searchParams.get("group") !== "off";
    const showSignatureColumn = url.searchParams.get("signature") === "on";
    const includeLogo = url.searchParams.get("logo") === "on";
    const customTitle = url.searchParams.get("title")?.trim() || null;
    const textSize = parsePdfTextSize(url.searchParams.get("size"));

    const [rows, filterDescription, branding] = await Promise.all([
      getReportRows(filters, 5000),
      describeFilters(filters),
      resolveReportBranding(supabase, includeLogo),
    ]);

    const buffer = await renderDistributionListPdf({
      textSize,
      rows,
      filterDescription,
      organizationName: branding.organizationName,
      logoUrl: branding.logoUrl,
      customTitle,
      groupByInstitution,
      showSignatureColumn,
    });

    const stamp = new Date().toISOString().slice(0, 10);

    return new Response(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="distribution-list-${stamp}.pdf"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "PDF generation failed";
    return new Response(msg, { status: msg === "Not authenticated" ? 401 : 500 });
  }
}
