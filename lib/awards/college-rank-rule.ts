import type { AwardBand } from "./percentage-rule";

/** "Rule 1" — the college award rule. Within each course (every year/period of
 *  it pooled together, per the conversation that designed this), a student
 *  scoring at or below this floor gets Consolation; above it, students are
 *  ranked against each other by percentage. */
export const COLLEGE_RANK_FLOOR = 50;

/** Dense ranking: students are sorted by percentage, highest first. Equal
 *  percentages share the same rank, and the next *distinct* percentage takes
 *  the very next rank (1, 1, 2 — not 1, 1, 3), per the conversation that
 *  designed this. Only the top three ranks map to 1st/2nd/3rd Rank; anyone
 *  ranked 4th or lower (even scoring above the floor) gets Consolation. */
export function rankCourseGroup(students: { id: string; percentage: number }[]): Map<string, AwardBand> {
  const sorted = [...students].sort((a, b) => b.percentage - a.percentage);
  const result = new Map<string, AwardBand>();
  let rank = 0;
  let prevPercentage: number | null = null;
  for (const s of sorted) {
    if (s.percentage !== prevPercentage) {
      rank += 1;
      prevPercentage = s.percentage;
    }
    result.set(s.id, rank === 1 ? "first" : rank === 2 ? "second" : rank === 3 ? "third" : "consolation");
  }
  return result;
}
