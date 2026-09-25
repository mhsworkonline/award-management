import ExcelJS from "exceljs";
import { requireUser } from "@/lib/supabase/server";
import { autoWidth, styleHeader } from "@/lib/excel/workbook";
import { getApplicationsByStandard } from "@/lib/data/submission-reports";
import { describeInstitutionTypes, parseInstitutionTypes } from "@/lib/data/submission-report-columns";
import { T } from "@/lib/tables";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const { supabase } = await requireUser();
    const url = new URL(request.url);
    const academicYearId = url.searchParams.get("academic_year_id");
    if (!academicYearId) return new Response("Missing academic_year_id", { status: 400 });

    const institutionTypes = parseInstitutionTypes(url.searchParams.get("types"));

    const [report, year] = await Promise.all([
      getApplicationsByStandard(academicYearId, institutionTypes),
      supabase.from(T.academicYears).select("label").eq("id", academicYearId).maybeSingle(),
    ]);
    const yearLabel = year.data?.label ?? "—";

    const wb = new ExcelJS.Workbook();
    wb.creator = "Award Management";
    wb.created = new Date();

    const sheet = wb.addWorksheet("Applications by Standard", {
      pageSetup: { orientation: "landscape", fitToPage: true, fitToWidth: 1 },
    });

    const headers = ["Standard", "Total Students", "Awarded", ...report.categories.map((c) => c.name)];
    sheet.addRow(headers);

    for (const row of report.rows) {
      sheet.addRow([
        row.label,
        row.totalStudents,
        row.awarded,
        ...report.categories.map((c) => row.categoryCounts[c.id] ?? 0),
      ]);
    }

    const totalsRow = sheet.addRow([
      "Total",
      report.rows.reduce((s, r) => s + r.totalStudents, 0),
      report.rows.reduce((s, r) => s + r.awarded, 0),
      ...report.categories.map((c) => report.rows.reduce((s, r) => s + (r.categoryCounts[c.id] ?? 0), 0)),
    ]);
    totalsRow.font = { bold: true };

    styleHeader(sheet);
    autoWidth(sheet);
    sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: headers.length } };

    const meta = wb.addWorksheet("Filters");
    meta.addRow(["Academic year", yearLabel]);
    meta.addRow(["Scope", "Approved applications only"]);
    meta.addRow(["Institution types", describeInstitutionTypes(institutionTypes)]);
    meta.getColumn(1).font = { bold: true };
    meta.getColumn(1).width = 20;
    meta.getColumn(2).width = 60;

    const buffer = await wb.xlsx.writeBuffer();
    const stamp = new Date().toISOString().slice(0, 10);

    return new Response(buffer, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="applications-by-standard-${stamp}.xlsx"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Export failed";
    return new Response(msg, { status: msg === "Not authenticated" ? 401 : 500 });
  }
}
