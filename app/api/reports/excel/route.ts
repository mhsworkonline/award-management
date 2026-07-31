import ExcelJS from "exceljs";
import { requireUser } from "@/lib/supabase/server";
import { autoWidth, styleHeader } from "@/lib/excel/workbook";
import { describeFilters, getReportRows, parseFilters } from "@/lib/data/reports";

export const maxDuration = 60;

const COLUMNS: { header: string; key: keyof Awaited<ReturnType<typeof getReportRows>>[number] }[] = [
  { header: "Student Name", key: "student_name" },
  { header: "Middle (Father's) Name", key: "father_name" },
  { header: "Institution", key: "institution_name" },
  { header: "Type", key: "institution_type" },
  { header: "Board", key: "board" },
  { header: "Medium", key: "medium" },
  { header: "Standard / Course", key: "placement" },
  { header: "Roll No", key: "roll_no" },
  { header: "Contact No", key: "contact_no" },
  { header: "Academic Year", key: "academic_year" },
  { header: "Percentage", key: "percentage" },
  { header: "Grade", key: "grade" },
  { header: "Rank", key: "rank" },
  { header: "Award(s)", key: "awards" },
  { header: "Gift(s)", key: "gifts" },
  { header: "Distribution", key: "distribution" },
];

export async function GET(request: Request) {
  try {
    await requireUser();

    const url = new URL(request.url);
    const filters = parseFilters(url.searchParams);
    const [rows, description] = await Promise.all([
      getReportRows(filters),
      describeFilters(filters),
    ]);

    const wb = new ExcelJS.Workbook();
    wb.creator = "Award Management";
    wb.created = new Date();

    const sheet = wb.addWorksheet("Report", {
      pageSetup: { orientation: "landscape", fitToPage: true, fitToWidth: 1 },
    });

    sheet.addRow(COLUMNS.map((c) => c.header));
    for (const row of rows) sheet.addRow(COLUMNS.map((c) => row[c.key] ?? ""));

    styleHeader(sheet);
    autoWidth(sheet);
    sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: COLUMNS.length } };

    const meta = wb.addWorksheet("Filters");
    meta.addRow(["Report generated", new Date().toLocaleString("en-IN")]);
    meta.addRow(["Filters applied", description]);
    meta.addRow(["Row count", rows.length]);
    meta.getColumn(1).font = { bold: true };
    meta.getColumn(1).width = 20;
    meta.getColumn(2).width = 90;

    const buffer = await wb.xlsx.writeBuffer();
    const stamp = new Date().toISOString().slice(0, 10);

    return new Response(buffer, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="award-report-${stamp}.xlsx"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Export failed";
    return new Response(msg, { status: msg === "Not authenticated" ? 401 : 500 });
  }
}
