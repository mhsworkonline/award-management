/** Column metadata for the Submissions List report, split out from
 *  submission-reports.ts on purpose: that file imports lib/supabase/server
 *  (which pulls in next/headers), so a client component importing
 *  SUBMISSION_LIST_COLUMNS as a *value* from there would drag next/headers
 *  into the client bundle and fail to build. This file has zero server
 *  imports, so the column picker UI can import it directly. */

export type SubmissionListRow = {
  code: string;
  applicant: string;
  institution: string;
  placement: string;
  awards: string;
  percentage: string;
  grade: string;
  board: string;
  medium: string;
  roll_no: string;
  contact_no: string;
  email: string;
  reviewed_by: string;
  /** Not a selectable column — the report is always grouped by these, so
   *  they're structural, not part of SUBMISSION_LIST_COLUMNS. `group_sort`
   *  is a plain string built so a lexicographic sort puts every school
   *  Standard first (in level order), then colleges/other courses
   *  alphabetically — see getApprovedSubmissionsList. */
  group_label: string;
  group_sort: string;
  /** Sort keys for SUBMISSION_SORT_OPTIONS — not columns. `sort_name` is
   *  first, last, middle (not `applicant`, which starts with the salutation
   *  and would sort everyone by "Mr"/"Ms" first). */
  sort_name: string;
  sort_percentage: number | null;
  /** Null when the applicant typed an institution that isn't in the list —
   *  see institutionKey(). */
  institution_id: string | null;
  institution_type: InstitutionTypeKey;
  /** Null for colleges and for applicants with no matched Standard. */
  standard_id: string | null;
  standard_level: number | null;
};

/** The subset of SubmissionListRow keys that are actual selectable columns —
 *  excludes the structural group_*, sort_* and institution_* fields, which
 *  are not exportable. */
export type SubmissionColumnKey = Exclude<
  keyof SubmissionListRow,
  "group_label" | "group_sort" | "sort_name" | "sort_percentage" | "institution_id" | "institution_type" | "standard_id" | "standard_level"
>;

export const INSTITUTION_TYPE_OPTIONS = [
  { key: "school", label: "Schools" },
  { key: "college", label: "Colleges" },
] as const;

export type InstitutionTypeKey = (typeof INSTITUTION_TYPE_OPTIONS)[number]["key"];

/** Query-string form of the selected types. Like the institution filter, an
 *  empty selection means "all types". */
export function parseInstitutionTypes(raw: string | null | undefined): Set<InstitutionTypeKey> {
  const valid = new Set<string>(INSTITUTION_TYPE_OPTIONS.map((o) => o.key));
  return new Set((raw ?? "").split(",").filter((k): k is InstitutionTypeKey => valid.has(k)));
}

export function serializeInstitutionTypes(types: ReadonlySet<InstitutionTypeKey>): string {
  return [...types].join(",");
}

export function filterByInstitutionTypes(
  rows: SubmissionListRow[],
  types: ReadonlySet<InstitutionTypeKey>,
): SubmissionListRow[] {
  return types.size === 0 ? rows : rows.filter((r) => types.has(r.institution_type));
}

/** Distinct Standards present in `rows`, in level order (Play Group first),
 *  for the Standard checklist. Labels come from group_label, which is the
 *  Standard's label whenever standard_id is set. */
export function standardOptions(rows: SubmissionListRow[]): { id: string; label: string; level: number }[] {
  const map = new Map<string, { id: string; label: string; level: number }>();
  for (const r of rows) {
    if (r.standard_id && r.standard_level !== null) {
      map.set(r.standard_id, { id: r.standard_id, label: r.group_label, level: r.standard_level });
    }
  }
  return [...map.values()].sort((a, b) => a.level - b.level);
}

/** An empty selection means "all Standards". */
export function filterByStandards(rows: SubmissionListRow[], ids: ReadonlySet<string>): SubmissionListRow[] {
  return ids.size === 0 ? rows : rows.filter((r) => r.standard_id !== null && ids.has(r.standard_id));
}

export function parseStandardFilter(raw: string | null | undefined): Set<string> {
  return new Set((raw ?? "").split(",").filter(Boolean));
}

export function serializeStandardFilter(ids: ReadonlySet<string>): string {
  return [...ids].join(",");
}

/** Human-readable form for the Excel "Filters" sheet. */
export function describeInstitutionTypes(types: ReadonlySet<InstitutionTypeKey>): string {
  return types.size === 0
    ? "All"
    : INSTITUTION_TYPE_OPTIONS.filter((o) => types.has(o.key))
        .map((o) => o.label)
        .join(", ");
}

/** Identifies an institution for the export filter: its id, or — for an
 *  institution the applicant typed in free-text — `other:<name>`, since those
 *  have no id. */
export function institutionKey(row: SubmissionListRow): string {
  return row.institution_id ?? `other:${row.institution}`;
}

/** Distinct institutions present in `rows`, A–Z, for the filter's checklist. */
export function institutionOptions(rows: SubmissionListRow[]): { key: string; name: string }[] {
  const map = new Map<string, string>();
  for (const r of rows) map.set(institutionKey(r), r.institution);
  return [...map.entries()]
    .map(([key, name]) => ({ key, name }))
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
}

/** An empty selection means "all institutions". */
export function filterByInstitutions(rows: SubmissionListRow[], keys: ReadonlySet<string>): SubmissionListRow[] {
  return keys.size === 0 ? rows : rows.filter((r) => keys.has(institutionKey(r)));
}

/** Query-string form of a selection: each key URI-encoded (free-text names can
 *  contain commas), comma-joined. */
export function serializeInstitutionFilter(keys: ReadonlySet<string>): string {
  return [...keys].map(encodeURIComponent).join(",");
}

export function parseInstitutionFilter(raw: string | null | undefined): Set<string> {
  if (!raw) return new Set();
  return new Set(raw.split(",").filter(Boolean).map(decodeURIComponent));
}

/** How students are ordered *within* each Standard/course section. To add
 *  another ordering, add an entry here — the picker, the preview and both
 *  exports all read this list. */
export const SUBMISSION_SORT_OPTIONS = [
  {
    key: "name",
    label: "Name (A–Z)",
    compare: (a: SubmissionListRow, b: SubmissionListRow) =>
      a.sort_name.localeCompare(b.sort_name, undefined, { sensitivity: "base" }),
  },
  {
    key: "code",
    label: "Code No.",
    compare: (a: SubmissionListRow, b: SubmissionListRow) =>
      a.code.localeCompare(b.code, undefined, { numeric: true }),
  },
  {
    key: "percentage",
    label: "Percentage (high to low)",
    compare: (a: SubmissionListRow, b: SubmissionListRow) =>
      (b.sort_percentage ?? -1) - (a.sort_percentage ?? -1),
  },
] as const;

export type SubmissionSortKey = (typeof SUBMISSION_SORT_OPTIONS)[number]["key"];

export const DEFAULT_SUBMISSION_SORT: SubmissionSortKey = "name";

export function parseSubmissionSort(raw: string | null | undefined): SubmissionSortKey {
  return SUBMISSION_SORT_OPTIONS.find((o) => o.key === raw)?.key ?? DEFAULT_SUBMISSION_SORT;
}

/** Every selectable column for the submissions list, in display order.
 *  `default: true` columns are checked on first load — everything else opts
 *  in. Shared between the preview table and both export routes so the
 *  checked set means exactly the same thing in all three places. */
export const SUBMISSION_LIST_COLUMNS: { key: SubmissionColumnKey; label: string; default: boolean }[] = [
  { key: "code", label: "Code No.", default: true },
  { key: "applicant", label: "Applicant Full Name", default: true },
  { key: "institution", label: "Institution", default: true },
  { key: "placement", label: "Standard / Course", default: true },
  { key: "percentage", label: "Percentage", default: true },
  { key: "grade", label: "Grade", default: true },
  { key: "awards", label: "Award(s)", default: false },
  { key: "board", label: "Board", default: false },
  { key: "medium", label: "Medium", default: false },
  { key: "roll_no", label: "Roll No.", default: false },
  { key: "contact_no", label: "Contact No.", default: false },
  { key: "email", label: "Email", default: false },
  { key: "reviewed_by", label: "Reviewed By", default: false },
];

/** What the placement column is called for the rows being reported: "Standard"
 *  when they are all school students, "Course" when all college, and
 *  "Standard / Course" only when the report mixes both (or has no rows yet). */
export function placementColumnLabel(rows: readonly SubmissionListRow[]): string {
  const types = new Set(rows.map((r) => r.institution_type));
  if (types.size === 1) return types.has("school") ? "Standard" : "Course";
  return "Standard / Course";
}

/** Column key → heading, with the placement column named for these rows. */
export function submissionColumnLabels(rows: readonly SubmissionListRow[]): Map<SubmissionColumnKey, string> {
  const placement = placementColumnLabel(rows);
  return new Map(SUBMISSION_LIST_COLUMNS.map((c) => [c.key, c.key === "placement" ? placement : c.label]));
}

export const DEFAULT_SUBMISSION_LIST_COLUMNS = SUBMISSION_LIST_COLUMNS.filter((c) => c.default).map(
  (c) => c.key,
);

export type SubmissionGroup = { key: string; label: string; rows: SubmissionListRow[] };

/** Every standard (or college course) stands out as its own section — the
 *  report's rows are always grouped this way, in the preview table and in
 *  both exports, using the same grouping so what's shown on screen is
 *  exactly what's downloaded. Mirrors groupRows() in lib/pdf/distribution-list.tsx,
 *  just keyed by group_sort/group_label instead of institution name. */
export function groupSubmissionRows(
  rows: SubmissionListRow[],
  sort: SubmissionSortKey = DEFAULT_SUBMISSION_SORT,
): SubmissionGroup[] {
  const compare = SUBMISSION_SORT_OPTIONS.find((o) => o.key === sort)!.compare;
  const byCode = SUBMISSION_SORT_OPTIONS.find((o) => o.key === "code")!.compare;
  const map = new Map<string, { label: string; rows: SubmissionListRow[] }>();
  for (const row of rows) {
    const existing = map.get(row.group_sort);
    if (existing) existing.rows.push(row);
    else map.set(row.group_sort, { label: row.group_label, rows: [row] });
  }
  return [...map.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, g]) => ({ key, label: g.label, rows: [...g.rows].sort((a, b) => compare(a, b) || byCode(a, b)) }));
}
