import { NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { Readable } from "node:stream";
import { requireUser } from "@/lib/supabase/server";
import { ORG_ID } from "@/lib/constants";
import { canonicalInstitutionHeader, REQUIRED_FIELDS, type InstitutionImportType } from "@/lib/excel/institutions-workbook";
import { cellText } from "@/lib/excel/workbook";
import { normalizeName } from "@/lib/utils";
import { T } from "@/lib/tables";

export const maxDuration = 60;

export type ParsedInstitutionRow = {
  rowNumber: number;
  name: string;
  board_id: string | null;
  board_label: string | null;
  medium_id: string | null;
  medium_label: string | null;
  city: string | null;
  contact_person: string | null;
  contact_no: string | null;
  errors: string[];
  duplicate: { source: "database" | "file"; detail: string } | null;
};

const FIELD_LABEL: Record<string, string> = {
  name: "Name",
  medium: "Medium",
  board: "Board",
};

/** Parse + validate only, same shape as /api/students/import — nothing is
 *  written here, the operator reviews and confirms, which calls
 *  commitInstitutionImport(). Accepts the CSV the template downloads as
 *  (preferred), and .xlsx too — someone re-saving the CSV in Excel is a
 *  common enough thing to do that rejecting it outright isn't worth it. */
export async function POST(request: Request) {
  try {
    const { supabase } = await requireUser();

    const form = await request.formData();
    const file = form.get("file");
    const type = form.get("type");

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
    }
    if (type !== "school" && type !== "college") {
      return NextResponse.json({ error: "type must be 'school' or 'college'" }, { status: 400 });
    }
    if (file.size > 8 * 1024 * 1024) {
      return NextResponse.json({ error: "File is larger than 8 MB" }, { status: 400 });
    }

    const workbook = new ExcelJS.Workbook();
    const isCsv = file.name.toLowerCase().endsWith(".csv") || file.type === "text/csv";
    if (isCsv) {
      await workbook.csv.read(Readable.from(Buffer.from(await file.arrayBuffer())));
    } else {
      await workbook.xlsx.load(await file.arrayBuffer());
    }

    const wantedSheet = type === "school" ? "schools" : "colleges";
    const sheet =
      workbook.worksheets.find((w) => w.name.trim().toLowerCase() === wantedSheet) ?? workbook.worksheets[0];
    if (!sheet) return NextResponse.json({ error: "Workbook has no sheets" }, { status: 400 });

    const headerRow = sheet.getRow(1);
    const columns = new Map<number, string>();
    headerRow.eachCell({ includeEmpty: false }, (cell, col) => {
      const field = canonicalInstitutionHeader(cellText(cell.value));
      if (field) columns.set(col, field);
    });

    const found = new Set(columns.values());
    const missingRequired = REQUIRED_FIELDS[type].filter((f) => !found.has(f));
    if (missingRequired.length > 0) {
      return NextResponse.json(
        {
          error: `Could not find the required ${missingRequired.map((f) => FIELD_LABEL[f]).join(", ")} column${missingRequired.length === 1 ? "" : "s"}. Use the downloadable template, or rename your column${missingRequired.length === 1 ? "" : "s"} to match.`,
        },
        { status: 400 },
      );
    }

    const [boards, mediums, existing] = await Promise.all([
      type === "school"
        ? supabase.from(T.boards).select("id,name").eq("org_id", ORG_ID)
        : Promise.resolve({ data: [] as { id: string; name: string }[] }),
      type === "school"
        ? supabase.from(T.mediums).select("id,name").eq("org_id", ORG_ID)
        : Promise.resolve({ data: [] as { id: string; name: string }[] }),
      // Not scoped by type — am_institutions has a unique (org_id, name)
      // constraint across every institution regardless of type, so a school
      // and a college can't share a name either.
      supabase.from(T.institutions).select("name").eq("org_id", ORG_ID).limit(20000),
    ]);

    const boardByName = new Map((boards.data ?? []).map((b) => [normalizeName(b.name), b]));
    const mediumByName = new Map((mediums.data ?? []).map((m) => [normalizeName(m.name), m]));
    const existingNames = new Set((existing.data ?? []).map((i) => normalizeName(i.name)));

    const seenInFile = new Map<string, number>();
    const rows: ParsedInstitutionRow[] = [];

    for (let rowNumber = 2; rowNumber <= sheet.rowCount; rowNumber++) {
      const row = sheet.getRow(rowNumber);
      const values: Record<string, string | null> = {};
      for (const [col, field] of columns) values[field] = cellText(row.getCell(col).value);

      const isBlank = Object.values(values).every((v) => v === null);
      if (isBlank) continue;

      const errors: string[] = [];
      const name = values.name ?? "";
      if (!name) errors.push("Name is required");
      if (name.length > 200) errors.push("Name is too long");

      let board_id: string | null = null;
      let board_label: string | null = null;
      let medium_id: string | null = null;
      let medium_label: string | null = null;

      if (type === "school") {
        const boardRaw = values.board;
        if (!boardRaw) {
          errors.push("Board is required");
        } else {
          const match = boardByName.get(normalizeName(boardRaw));
          if (match) {
            board_id = match.id;
            board_label = match.name;
          } else {
            errors.push(`Unknown board "${boardRaw}" — add it under Settings first`);
          }
        }

        const mediumRaw = values.medium;
        if (!mediumRaw) {
          errors.push("Medium is required");
        } else {
          const match = mediumByName.get(normalizeName(mediumRaw));
          if (match) {
            medium_id = match.id;
            medium_label = match.name;
          } else {
            errors.push(`Unknown medium "${mediumRaw}" — add it under Settings first`);
          }
        }
      }

      const key = normalizeName(name);
      let duplicate: ParsedInstitutionRow["duplicate"] = null;
      if (name) {
        if (existingNames.has(key)) {
          duplicate = {
            source: "database",
            detail: `An institution named "${name}" already exists — left unselected to avoid a duplicate`,
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
        name,
        board_id,
        board_label,
        medium_id,
        medium_label,
        city: values.city ?? null,
        contact_person: values.contact_person ?? null,
        contact_no: values.contact_no ?? null,
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
        alreadyExists: rows.filter((r) => r.duplicate?.source === "database").length,
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Import failed";
    const status = msg === "Not authenticated" ? 401 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
