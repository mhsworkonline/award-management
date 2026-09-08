export type InstitutionImportType = "school" | "college";

/** Column order matters: Name, Medium and Board are the mandatory columns
 *  for a school and must come first — everything after them is optional.
 *  Colleges have neither Medium nor Board (see institutionSchema's college
 *  transform), so Name is their only mandatory column. */
const COLUMNS: Record<InstitutionImportType, readonly string[]> = {
  school: ["School Name", "Medium", "Board", "City", "Contact Person", "Contact No"],
  college: ["College Name", "City", "Contact Person", "Contact No"],
};

/** Which columns are mandatory, matched against the canonical field names
 *  HEADER_ALIASES resolves to below. */
export const REQUIRED_FIELDS: Record<InstitutionImportType, readonly string[]> = {
  school: ["name", "medium", "board"],
  college: ["name"],
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

const SAMPLE_ROWS: Record<InstitutionImportType, readonly (readonly string[])[]> = {
  school: [
    ["Shree Vidyalaya High School", "Gujarati", "State Board", "Bhuj", "Rakesh Shah", "9876543210"],
    ["St. Xavier's School", "English", "CBSE", "Bhuj", "", ""],
  ],
  college: [
    ["Government Engineering College", "Bhuj", "Priya Mehta", "9812345678"],
    ["KSKV Kutch University", "Bhuj", "", ""],
  ],
};

/** A field containing a comma, quote or newline needs wrapping in quotes
 *  (with internal quotes doubled) to stay valid CSV — plain values pass
 *  through untouched. */
function csvField(value: string) {
  if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

function toCsv(rows: readonly (readonly string[])[]) {
  return rows.map((row) => row.map(csvField).join(",")).join("\r\n") + "\r\n";
}

/** Sample CSV — header row plus a couple of filled-in examples — for the
 *  operator to download, fill in, and re-upload. Deliberately just data, no
 *  separate instructions sheet (CSV doesn't have multiple sheets); the
 *  wizard's own hint text next to the upload field carries the guidance. */
export function buildInstitutionImportCsv(type: InstitutionImportType) {
  return toCsv([COLUMNS[type], ...SAMPLE_ROWS[type]]);
}
