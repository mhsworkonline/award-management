import { NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { requireUser } from "@/lib/supabase/server";
import { ORG_ID } from "@/lib/constants";
import { canonicalHeader, cellText } from "@/lib/excel/workbook";
import { normalizeName } from "@/lib/utils";
import { T } from "@/lib/tables";

export const maxDuration = 60;

export type ParsedImportRow = {
  rowNumber: number;
  first_name: string;
  middle_name: string | null;
  last_name: string;
  roll_no: string | null;
  contact_no: string | null;
  standard_id: string | null;
  course_id: string | null;
  period_no: number | null;
  placement: string;
  errors: string[];
  duplicate: { source: "database" | "file"; detail: string } | null;
};

/** Parse + validate only. Nothing is written here — the operator reviews the
 *  result and confirms, which calls commitImport(). Matching an existing
 *  student here is informational; commitImport() re-checks at write time. */
export async function POST(request: Request) {
  try {
    const { supabase } = await requireUser();

    const form = await request.formData();
    const file = form.get("file");
    const institutionId = String(form.get("institution_id") ?? "");
    const academicYearId = String(form.get("academic_year_id") ?? "");

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
    }
    if (!institutionId || !academicYearId) {
      return NextResponse.json(
        { error: "Select an institution and academic year before uploading" },
        { status: 400 },
      );
    }
    if (file.size > 8 * 1024 * 1024) {
      return NextResponse.json({ error: "File is larger than 8 MB" }, { status: 400 });
    }

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(await file.arrayBuffer());

    const sheet =
      workbook.worksheets.find((w) => w.name.trim().toLowerCase() === "students") ??
      workbook.worksheets[0];
    if (!sheet) return NextResponse.json({ error: "Workbook has no sheets" }, { status: 400 });

    const headerRow = sheet.getRow(1);
    const columns = new Map<number, string>();
    headerRow.eachCell({ includeEmpty: false }, (cell, col) => {
      const field = canonicalHeader(cellText(cell.value));
      if (field) columns.set(col, field);
    });

    const found = new Set(columns.values());
    if (!found.has("first_name") || !found.has("last_name")) {
      return NextResponse.json(
        {
          error:
            "Could not find First Name / Last Name columns. Use the downloadable template, or rename your columns to match.",
        },
        { status: 400 },
      );
    }

    const [standards, courses, existing] = await Promise.all([
      supabase.from(T.standards).select("id,label,level").eq("org_id", ORG_ID),
      supabase.from(T.courses).select("id,name,structure_type,total_periods").eq("org_id", ORG_ID),
      supabase.from(T.students).select("first_name,middle_name,last_name").eq("org_id", ORG_ID).limit(50000),
    ]);

    const standardByKey = new Map<string, { id: string; label: string }>();
    for (const s of standards.data ?? []) {
      standardByKey.set(normalizeName(s.label), { id: s.id, label: s.label });
      standardByKey.set(String(s.level), { id: s.id, label: s.label });
      standardByKey.set(`std ${s.level}`, { id: s.id, label: s.label });
      standardByKey.set(`class ${s.level}`, { id: s.id, label: s.label });
    }

    const courseByName = new Map<
      string,
      { id: string; name: string; structure_type: string; total_periods: number }
    >();
    for (const c of courses.data ?? []) courseByName.set(normalizeName(c.name), c);

    const existingKeys = new Set(
      (existing.data ?? []).map(
        (s) => `${normalizeName(s.first_name)}|${normalizeName(s.middle_name)}|${normalizeName(s.last_name)}`,
      ),
    );

    const seenInFile = new Map<string, number>();
    const rows: ParsedImportRow[] = [];

    for (let rowNumber = 2; rowNumber <= sheet.rowCount; rowNumber++) {
      const row = sheet.getRow(rowNumber);
      const values: Record<string, string | null> = {};
      for (const [col, field] of columns) values[field] = cellText(row.getCell(col).value);

      const isBlank = Object.values(values).every((v) => v === null);
      if (isBlank) continue;

      const errors: string[] = [];
      const first_name = values.first_name ?? "";
      const last_name = values.last_name ?? "";
      if (!first_name) errors.push("First name is required");
      if (!last_name) errors.push("Last name is required");
      if (first_name.length > 100 || last_name.length > 100) errors.push("Name is too long");

      let standard_id: string | null = null;
      let course_id: string | null = null;
      let period_no: number | null = null;
      let placement = "—";

      const standardRaw = values.standard_label;
      const courseRaw = values.course_name;

      if (standardRaw) {
        const match = standardByKey.get(normalizeName(standardRaw));
        if (match) {
          standard_id = match.id;
          placement = match.label;
        } else {
          errors.push(`Unknown standard "${standardRaw}" — add it under Settings first`);
        }
      }

      if (courseRaw) {
        const match = courseByName.get(normalizeName(courseRaw));
        if (match) {
          course_id = match.id;
          const rawPeriod = values.period_no;
          const parsedPeriod = rawPeriod ? Number(String(rawPeriod).replace(/\D/g, "")) : NaN;

          if (!Number.isFinite(parsedPeriod) || parsedPeriod < 1) {
            errors.push(`Year/Sem is required for course "${match.name}"`);
          } else if (parsedPeriod > match.total_periods) {
            errors.push(
              `${match.name} has ${match.total_periods} ${match.structure_type}s — got ${parsedPeriod}`,
            );
          } else {
            period_no = parsedPeriod;
            const unit = match.structure_type === "semester" ? "Sem" : "Year";
            placement = `${match.name} · ${unit} ${parsedPeriod}`;
          }
        } else {
          errors.push(`Unknown course "${courseRaw}" — add it under Settings first`);
        }
      }

      if (!standardRaw && !courseRaw) errors.push("Provide either a Standard or a Course");
      if (standardRaw && courseRaw) errors.push("Provide a Standard or a Course, not both");

      const key = `${normalizeName(first_name)}|${normalizeName(values.middle_name)}|${normalizeName(last_name)}`;
      let duplicate: ParsedImportRow["duplicate"] = null;
      if (first_name && last_name) {
        if (existingKeys.has(key)) {
          duplicate = {
            source: "database",
            detail: "Matches an existing student — will be enrolled, not duplicated",
          };
        } else if (seenInFile.has(key)) {
          duplicate = {
            source: "file",
            detail: `Same name appears earlier in this file (row ${seenInFile.get(key)})`,
          };
        } else {
          seenInFile.set(key, rowNumber);
        }
      }

      rows.push({
        rowNumber,
        first_name,
        middle_name: values.middle_name ?? null,
        last_name,
        roll_no: values.roll_no ?? null,
        contact_no: values.contact_no ?? null,
        standard_id,
        course_id,
        period_no,
        placement,
        errors,
        duplicate,
      });
    }

    if (rows.length === 0) {
      return NextResponse.json({ error: "No data rows found in the sheet" }, { status: 400 });
    }
    if (rows.length > 5000) {
      return NextResponse.json(
        { error: `Sheet has ${rows.length} rows — split it into files of 5,000 or fewer` },
        { status: 400 },
      );
    }

    return NextResponse.json({
      rows,
      summary: {
        total: rows.length,
        valid: rows.filter((r) => r.errors.length === 0).length,
        withErrors: rows.filter((r) => r.errors.length > 0).length,
        duplicates: rows.filter((r) => r.duplicate?.source === "file").length,
        matchedExisting: rows.filter((r) => r.duplicate?.source === "database").length,
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Import failed";
    const status = msg === "Not authenticated" ? 401 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
