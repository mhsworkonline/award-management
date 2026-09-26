import ExcelJS from "exceljs";
import { requireUser } from "@/lib/supabase/server";
import { autoWidth, styleHeader } from "@/lib/excel/workbook";
import { getApprovedSubmissionsList } from "@/lib/data/submission-reports";
import {
  DEFAULT_SUBMISSION_LIST_COLUMNS,
  SUBMISSION_LIST_COLUMNS,
  describeInstitutionTypes,
  filterByInstitutionTypes,
  filterByInstitutions,
  filterByStandards,
  groupSubmissionRows,
  institutionOptions,
  submissionColumnLabels,
  parseInstitutionFilter,
  parseInstitutionTypes,
  parseStandardFilter,
  standardOptions,
  parseSubmissionSort,
  type SubmissionColumnKey,
} from "@/lib/data/submission-report-columns";
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
    const sort = parseSubmissionSort(url.searchParams.get("sort"));
    const institutionKeys = parseInstitutionFilter(url.searchParams.get("institutions"));
    const institutionTypes = parseInstitutionTypes(url.searchParams.get("types"));
    const standardIds = parseStandardFilter(url.searchParams.get("standards"));

    const [allRows, year] = await Promise.all([
      getApprovedSubmissionsList(academicYearId),
      supabase.from(T.academicYears).select("label").eq("id", academicYearId).maybeSingle(),
    ]);
    const rows = filterByStandards(
      filterByInstitutions(filterByInstitutionTypes(allRows, institutionTypes), institutionKeys),
      standardIds,
    );

    const labels = submissionColumnLabels(rows);

    const wb = new ExcelJS.Workbook();
    wb.creator = "Award Management";
    wb.created = new Date();

    const sheet = wb.addWorksheet("Approved Applications", {
      pageSetup: { orientation: "landscape", fitToPage: true, fitToWidth: 1 },
    });

    sheet.addRow(columns.map((key) => labels.get(key)));

    // One section per Standard/course — a bold, filled divider row ahead of
    // each group's students, same grouping as the preview table and the PDF.
    const GROUP_FILL: ExcelJS.Fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF1F3F7" } };
    for (const group of groupSubmissionRows(rows, sort)) {
      const groupRow = sheet.addRow([`${group.label} (${group.rows.length})`]);
      const lastColumn = Math.max(columns.length, 1);
      sheet.mergeCells(groupRow.number, 1, groupRow.number, lastColumn);
      groupRow.font = { bold: true };
      for (let col = 1; col <= lastColumn; col++) groupRow.getCell(col).fill = GROUP_FILL;

      for (const row of group.rows) sheet.addRow(columns.map((key) => row[key] ?? ""));
    }

    styleHeader(sheet);
    autoWidth(sheet);

    const meta = wb.addWorksheet("Filters");
    meta.addRow(["Academic year", year.data?.label ?? "—"]);
    meta.addRow(["Scope", "Approved applications only"]);
    meta.addRow(["Institution types", describeInstitutionTypes(institutionTypes)]);
    meta.addRow([
      "Standards",
      standardIds.size === 0
        ? "All"
        : standardOptions(rows)
            .map((o) => o.label)
            .join(", "),
    ]);
    meta.addRow([
      "Institutions",
      institutionKeys.size === 0
        ? "All"
        : institutionOptions(rows)
            .map((o) => o.name)
            .join(", "),
    ]);
    meta.addRow(["Row count", rows.length]);
    meta.getColumn(1).font = { bold: true };
    meta.getColumn(1).width = 20;
    meta.getColumn(2).width = 60;

    const buffer = await wb.xlsx.writeBuffer();
    const stamp = new Date().toISOString().slice(0, 10);

    return new Response(buffer, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="approved-applications-${stamp}.xlsx"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Export failed";
    return new Response(msg, { status: msg === "Not authenticated" ? 401 : 500 });
  }
}
