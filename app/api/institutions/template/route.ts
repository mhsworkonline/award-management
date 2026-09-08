import { requireUser } from "@/lib/supabase/server";
import { buildInstitutionImportCsv, type InstitutionImportType } from "@/lib/excel/institutions-workbook";

export async function GET(request: Request) {
  try {
    await requireUser();
    const type = new URL(request.url).searchParams.get("type");
    if (type !== "school" && type !== "college") {
      return new Response("type must be 'school' or 'college'", { status: 400 });
    }

    const csv = buildInstitutionImportCsv(type as InstitutionImportType);

    return new Response(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${type}-import-template.csv"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed";
    return new Response(msg, { status: msg === "Not authenticated" ? 401 : 500 });
  }
}
