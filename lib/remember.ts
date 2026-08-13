/** Remembers the operator's last-used dropdown selections on the "Add student"
 *  page across visits (localStorage, client-only). Explicit deep links (e.g.
 *  "Add student" from a specific institution) still take priority — this is
 *  only the fallback when nothing more specific was passed in. */

const KEY = "am_new_student_defaults";

export type RememberedStudentDefaults = {
  instType?: "school" | "college";
  boardId?: string;
  institutionId?: string;
  academicYearId?: string;
};

export function loadRememberedDefaults(): RememberedStudentDefaults {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as RememberedStudentDefaults) : {};
  } catch {
    return {};
  }
}

export function saveRememberedDefaults(next: RememberedStudentDefaults) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // Storage full or unavailable (private browsing) — not worth surfacing.
  }
}
