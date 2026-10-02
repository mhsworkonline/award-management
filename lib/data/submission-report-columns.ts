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
  /** The award's place in Settings → Award categories (1st Rank = 1 … Consolation = 4);
   *  large when the student has no award, so unawarded students sort last. */
  sort_rank: number;
  /** Null when the applicant typed an institution that isn't in the list —
   *  see institutionKey(). */
  institution_id: string | null;
  institution_type: InstitutionTypeKey;
  /** Null for colleges and for applicants with no matched Standard. One key per
   *  Standard, except Std 11/12 which get one key per Stream (Arts/Commerce/
   *  Science) — see getApprovedSubmissionsList. This is also the report's
   *  section key, so the Standard filter's options always match the sections
   *  the report actually prints. */
  standard_group_key: string | null;
  /** Display text for standard_group_key — "Std 11 — Commerce", not just "Std 11". */
  standard_group_label: string;
  standard_level: number | null;
};

/** The subset of SubmissionListRow keys that are actual selectable columns —
 *  excludes the structural group_, sort_, institution_ and standard_ fields,
 *  which are not exportable. */
export type SubmissionColumnKey = Exclude<
  keyof SubmissionListRow,
  | "group_label"
  | "group_sort"
  | "sort_name"
  | "sort_percentage"
  | "sort_rank"
  | "institution_id"
  | "institution_type"
  | "standard_group_key"
  | "standard_group_label"
  | "standard_level"
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

/** Distinct Standards present in `rows`, in level order (Play Group first) —
 *  Std 11/12 appear as one entry per Stream ("Std 11 — Commerce", "Std 11 —
 *  Science", ...) rather than one combined "Std 11", so each can be picked
 *  independently and matches the report's own sectioning exactly. */
export function standardOptions(rows: SubmissionListRow[]): { id: string; label: string; level: number }[] {
  const map = new Map<string, { id: string; label: string; level: number }>();
  for (const r of rows) {
    if (r.standard_group_key && r.standard_level !== null) {
      map.set(r.standard_group_key, { id: r.standard_group_key, label: r.standard_group_label, level: r.standard_level });
    }
  }
  return [...map.values()].sort((a, b) => a.level - b.level || a.label.localeCompare(b.label));
}

/** An empty selection means "all Standards". */
export function filterByStandards(rows: SubmissionListRow[], ids: ReadonlySet<string>): SubmissionListRow[] {
  return ids.size === 0
    ? rows
    : rows.filter((r) => r.standard_group_key !== null && ids.has(r.standard_group_key));
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

/** How students are ordered *within* each Standard/course section — up to
 *  SUBMISSION_SORT_LEVELS orderings applied in turn (1st sort, then 2nd for ties,
 *  then 3rd). To add another ordering, add an entry here — the pickers, the
 *  preview and both exports all read this list. */
export const SUBMISSION_SORT_OPTIONS = [
  {
    key: "name",
    label: "Name",
    compare: (a: SubmissionListRow, b: SubmissionListRow) =>
      a.sort_name.localeCompare(b.sort_name, undefined, { sensitivity: "base" }),
  },
  {
    key: "percentage",
    label: "Percentage",
    // Highest first; students with no percentage go last.
    compare: (a: SubmissionListRow, b: SubmissionListRow) =>
      (b.sort_percentage ?? -1) - (a.sort_percentage ?? -1),
  },
  {
    key: "rank",
    label: "Rank",
    // 1st Rank, 2nd Rank, 3rd Rank, Consolation; no award last.
    compare: (a: SubmissionListRow, b: SubmissionListRow) => a.sort_rank - b.sort_rank,
  },
] as const;

export type SubmissionSortKey = (typeof SUBMISSION_SORT_OPTIONS)[number]["key"];

export const SUBMISSION_SORT_LEVELS = 3;
export const DEFAULT_SUBMISSION_SORTS: SubmissionSortKey[] = ["name"];

/** Code no. always settles whatever the chosen sorts leave tied, so the order is stable. */
const compareByCode = (a: SubmissionListRow, b: SubmissionListRow) =>
  a.code.localeCompare(b.code, undefined, { numeric: true });

/** `sort=name,percentage,rank` → the valid, de-duplicated keys in order (max 3).
 *  Falls back to Name when nothing valid is given. */
export function parseSubmissionSorts(raw: string | null | undefined): SubmissionSortKey[] {
  const valid = new Set<string>(SUBMISSION_SORT_OPTIONS.map((o) => o.key));
  const keys: SubmissionSortKey[] = [];
  for (const k of (raw ?? "").split(",")) {
    if (valid.has(k) && !keys.includes(k as SubmissionSortKey)) keys.push(k as SubmissionSortKey);
  }
  return keys.length > 0 ? keys.slice(0, SUBMISSION_SORT_LEVELS) : DEFAULT_SUBMISSION_SORTS;
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
  sorts: SubmissionSortKey[] = DEFAULT_SUBMISSION_SORTS,
): SubmissionGroup[] {
  const compares = sorts.map((key) => SUBMISSION_SORT_OPTIONS.find((o) => o.key === key)!.compare);
  const compare = (a: SubmissionListRow, b: SubmissionListRow) => {
    for (const cmp of compares) {
      const result = cmp(a, b);
      if (result) return result;
    }
    return compareByCode(a, b);
  };
  const map = new Map<string, { label: string; rows: SubmissionListRow[] }>();
  for (const row of rows) {
    const existing = map.get(row.group_sort);
    if (existing) existing.rows.push(row);
    else map.set(row.group_sort, { label: row.group_label, rows: [row] });
  }
  return [...map.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, g]) => ({ key, label: g.label, rows: [...g.rows].sort(compare) }));
}
