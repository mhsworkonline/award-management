import ExcelJS from "exceljs";

export const IMPORT_COLUMNS = [
  "First Name",
  "Middle Name (Father's Name)",
  "Last Name",
  "Standard",
  "Course",
  "Year/Sem",
  "Roll No",
  "Contact No",
] as const;

/** Column header → canonical field. Tolerant of the header spellings institutions
 *  actually send (`Given Name`, `Father's Name`, `Surname`, …). */
const HEADER_ALIASES: Record<string, string> = {
  "first name": "first_name",
  "given name": "first_name",
  firstname: "first_name",
  first_name: "first_name",

  "middle name": "middle_name",
  "middle name (father's name)": "middle_name",
  "father name": "middle_name",
  "fathers name": "middle_name",
  "father's name": "middle_name",
  father: "middle_name",
  middle_name: "middle_name",
  "parent name": "middle_name",

  "last name": "last_name",
  surname: "last_name",
  lastname: "last_name",
  last_name: "last_name",

  standard: "standard_label",
  std: "standard_label",
  class: "standard_label",
  standard_label: "standard_label",

  course: "course_name",
  degree: "course_name",
  branch: "course_name",
  course_name: "course_name",

  "year/sem": "period_no",
  "year sem": "period_no",
  year: "period_no",
  sem: "period_no",
  semester: "period_no",
  period: "period_no",
  period_no: "period_no",

  "roll no": "roll_no",
  rollno: "roll_no",
  "roll number": "roll_no",
  roll_no: "roll_no",
  "gr no": "roll_no",

  "contact no": "contact_no",
  contact: "contact_no",
  mobile: "contact_no",
  phone: "contact_no",
  contact_no: "contact_no",
};

export function canonicalHeader(raw: unknown) {
  const key = String(raw ?? "")
    .trim()
    .toLowerCase()
    .replace(/[.]/g, "")
    .replace(/\s+/g, " ");
  return HEADER_ALIASES[key] ?? null;
}

export function cellText(value: ExcelJS.CellValue): string | null {
  if (value === null || value === undefined) return null;

  if (value instanceof Date) return value.toISOString();

  if (typeof value === "object") {
    const obj = value as unknown as Record<string, unknown>;
    if (Array.isArray(obj.richText)) {
      const joined = (obj.richText as { text?: string }[]).map((r) => r.text ?? "").join("");
      return joined.trim() || null;
    }
    if (typeof obj.text === "string") return obj.text.trim() || null;
    if ("result" in obj) return String(obj.result ?? "").trim() || null;
    if ("hyperlink" in obj) return String(obj.text ?? obj.hyperlink ?? "").trim() || null;
  }

  const text = String(value).trim();
  return text.length ? text : null;
}

const HEADER_FILL: ExcelJS.Fill = {
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: "FFF1F3F7" },
};

export function styleHeader(sheet: ExcelJS.Worksheet) {
  const header = sheet.getRow(1);
  header.font = { bold: true, size: 11 };
  header.alignment = { vertical: "middle" };
  header.height = 20;
  header.eachCell((cell) => {
    cell.fill = HEADER_FILL;
    cell.border = { bottom: { style: "thin", color: { argb: "FFD5D9E0" } } };
  });
  sheet.views = [{ state: "frozen", ySplit: 1 }];
}

export function autoWidth(sheet: ExcelJS.Worksheet, min = 12, max = 42) {
  sheet.columns.forEach((column) => {
    let width = min;
    column.eachCell?.({ includeEmpty: false }, (cell) => {
      const len = String(cell.value ?? "").length + 2;
      if (len > width) width = len;
    });
    column.width = Math.min(width, max);
  });
}

/** Blank sheet with the exact headers the parser understands. */
export async function buildImportTemplate() {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Award Management";
  const sheet = wb.addWorksheet("Students");

  sheet.addRow([...IMPORT_COLUMNS]);
  sheet.addRow(["Riya", "Mahesh", "Patel", "Std 10", "", "", "A-14", "9876543210"]);
  sheet.addRow(["Aman", "Kiran", "Shah", "", "BTech", "4", "BT-221", "9812345678"]);

  styleHeader(sheet);
  autoWidth(sheet);

  const notes = wb.addWorksheet("Instructions");
  notes.addRow(["How to use this template"]);
  notes.addRow([]);
  notes.addRow(["1.", "Fill one row per student on the Students sheet."]);
  notes.addRow(["2.", "School students: fill Standard (e.g. Std 10). Leave Course and Year/Sem blank."]);
  notes.addRow(["3.", "College students: fill Course (e.g. BTech) and Year/Sem (e.g. 4). Leave Standard blank."]);
  notes.addRow(["4.", "Standard and Course names must match those configured under Settings."]);
  notes.addRow(["5.", "Institution and academic year are chosen during upload — no columns needed."]);
  notes.getRow(1).font = { bold: true, size: 12 };
  notes.getColumn(1).width = 5;
  notes.getColumn(2).width = 90;

  return wb;
}
