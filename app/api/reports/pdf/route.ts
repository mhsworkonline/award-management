import { requireUser } from "@/lib/supabase/server";
import { ORG_ID } from "@/lib/constants";
import { describeFilters, getReportRows, parseFilters } from "@/lib/data/reports";
import { renderDistributionListPdf } from "@/lib/pdf/distribution-list";
import { T } from "@/lib/tables";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const { supabase } = await requireUser();

    const url = new URL(request.url);
    const filters = parseFilters(url.searchParams);
    const groupByInstitution = url.searchParams.get("group") !== "off";
    const showSignatureColumn = url.searchParams.get("signature") === "on";

    const [rows, filterDescription, org] = await Promise.all([
      getReportRows(filters, 5000),
      describeFilters(filters),
      supabase.from(T.organizations).select("name").eq("id", ORG_ID).maybeSingle(),
    ]);

    const buffer = await renderDistributionListPdf({
      rows,
      filterDescription,
      organizationName: org.data?.name ?? "Award Management",
      generatedAt: new Date().toLocaleString("en-IN"),
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
