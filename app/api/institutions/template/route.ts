import { requireUser } from "@/lib/supabase/server";
import { buildInstitutionImportTemplate, type InstitutionImportType } from "@/lib/excel/institutions-workbook";

export async function GET(request: Request) {
  try {
    await requireUser();
    const type = new URL(request.url).searchParams.get("type");
    if (type !== "school" && type !== "college") {
      return new Response("type must be 'school' or 'college'", { status: 400 });
    }

    const wb = await buildInstitutionImportTemplate(type as InstitutionImportType);
    const buffer = await wb.xlsx.writeBuffer();

    return new Response(buffer, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${type}-import-template.xlsx"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed";
    return new Response(msg, { status: msg === "Not authenticated" ? 401 : 500 });
  }
}
