import { requireUser } from "@/lib/supabase/server";
import { buildImportTemplate } from "@/lib/excel/workbook";

export async function GET() {
  try {
    await requireUser();
    const wb = await buildImportTemplate();
    const buffer = await wb.xlsx.writeBuffer();

    return new Response(buffer, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": 'attachment; filename="student-import-template.xlsx"',
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed";
    return new Response(msg, { status: msg === "Not authenticated" ? 401 : 500 });
  }
}
