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
};

/** The subset of SubmissionListRow keys that are actual selectable columns —
 *  excludes group_label/group_sort, which are structural, not exportable. */
export type SubmissionColumnKey = Exclude<keyof SubmissionListRow, "group_label" | "group_sort">;

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

export const DEFAULT_SUBMISSION_LIST_COLUMNS = SUBMISSION_LIST_COLUMNS.filter((c) => c.default).map(
  (c) => c.key,
);

export type SubmissionGroup = { key: string; label: string; rows: SubmissionListRow[] };

/** Every standard (or college course) stands out as its own section — the
 *  report's rows are always grouped this way, in the preview table and in
 *  both exports, using the same grouping so what's shown on screen is
 *  exactly what's downloaded. Mirrors groupRows() in lib/pdf/distribution-list.tsx,
 *  just keyed by group_sort/group_label instead of institution name. */
export function groupSubmissionRows(rows: SubmissionListRow[]): SubmissionGroup[] {
  const map = new Map<string, { label: string; rows: SubmissionListRow[] }>();
  for (const row of rows) {
    const existing = map.get(row.group_sort);
    if (existing) existing.rows.push(row);
    else map.set(row.group_sort, { label: row.group_label, rows: [row] });
  }
  return [...map.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, g]) => ({ key, label: g.label, rows: g.rows }));
}
