import ExcelJS from "exceljs";
import { autoWidth, styleHeader } from "./workbook";

export type InstitutionImportType = "school" | "college";

/** Schools carry Board/Medium columns; colleges don't (neither concept
 *  applies to them — see institutionSchema's college transform). Name is
 *  the only required column for either; everything else is optional. */
const COLUMNS: Record<InstitutionImportType, readonly string[]> = {
  school: ["School Name", "Board", "Medium", "City", "Contact Person", "Contact No"],
  college: ["College Name", "City", "Contact Person", "Contact No"],
};

/** Column header → canonical field, tolerant of the header spellings
 *  institutions actually send. */
const HEADER_ALIASES: Record<string, string> = {
  "school name": "name",
  "college name": "name",
  "institution name": "name",
  institution: "name",
  name: "name",

  board: "board",

  medium: "medium",
  "medium of instruction": "medium",

  city: "city",
  town: "city",
  "city / town": "city",
  "city/town": "city",

  "contact person": "contact_person",
  "contact name": "contact_person",
  contact_person: "contact_person",

  "contact no": "contact_no",
  "contact number": "contact_no",
  contact: "contact_no",
  mobile: "contact_no",
  phone: "contact_no",
  contact_no: "contact_no",
};

export function canonicalInstitutionHeader(raw: unknown) {
  const key = String(raw ?? "")
    .trim()
    .toLowerCase()
    .replace(/[.]/g, "")
    .replace(/\s+/g, " ");
  return HEADER_ALIASES[key] ?? null;
}

/** Blank sheet with the exact headers the parser understands — one per
 *  institution type, since the columns genuinely differ (no Board/Medium
 *  for colleges). */
export async function buildInstitutionImportTemplate(type: InstitutionImportType) {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Award Management";
  const sheetName = type === "school" ? "Schools" : "Colleges";
  const sheet = wb.addWorksheet(sheetName);

  sheet.addRow([...COLUMNS[type]]);
  if (type === "school") {
    sheet.addRow(["Shree Vidyalaya High School", "State Board", "Gujarati", "Bhuj", "Rakesh Shah", "9876543210"]);
    sheet.addRow(["St. Xavier's School", "CBSE", "English", "Bhuj", "", ""]);
  } else {
    sheet.addRow(["Government Engineering College", "Bhuj", "Priya Mehta", "9812345678"]);
    sheet.addRow(["KSKV Kutch University", "Bhuj", "", ""]);
  }

  styleHeader(sheet);
  autoWidth(sheet);

  const notes = wb.addWorksheet("Instructions");
  notes.addRow(["How to use this template"]);
  notes.addRow([]);
  notes.addRow(["1.", `Fill one row per ${type} on the ${sheetName} sheet.`]);
  notes.addRow(["2.", `${type === "school" ? "School" : "College"} Name is the only required column.`]);
  if (type === "school") {
    notes.addRow(["3.", "Board and Medium must match those configured under Settings, if provided."]);
    notes.addRow(["4.", "Everything else — City, Contact Person, Contact No — is optional."]);
  } else {
    notes.addRow(["3.", "City, Contact Person and Contact No are all optional."]);
  }
  notes.getRow(1).font = { bold: true, size: 12 };
  notes.getColumn(1).width = 5;
  notes.getColumn(2).width = 90;

  return wb;
}
