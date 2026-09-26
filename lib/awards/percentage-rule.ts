/** The school award rule, kept apart from the server action so it's one small,
 *  readable place to change. Applies to every school Standard:
 *    Play Group, Nursery, LKG, UKG → Consolation, whatever their grade
 *    Std 1–12, then by percentage:
 *    90%+          → 1st Rank
 *    80% – 89.99%  → 2nd Rank
 *    70% – 79.99%  → 3rd Rank
 *    below 70%     → Consolation
 *    no percentage and no grade → Consolation
 *  A grade but no percentage is deliberately left alone ("skip") — staff decide
 *  those by hand. Streams (Std 11/12) make no difference: same bands for all. */

export type AwardBand = "first" | "second" | "third" | "consolation";

/** Each band's category name in Settings → Award categories. */
export const BAND_CATEGORY_NAMES: Record<AwardBand, string> = {
  first: "1st Rank",
  second: "2nd Rank",
  third: "3rd Rank",
  consolation: "Consolation",
};

export const BAND_ORDER: AwardBand[] = ["first", "second", "third", "consolation"];

/** am_standards.level is negative before Std 1 (-4 Play Group … -1 UKG). */
export const PRE_PRIMARY_MAX_LEVEL = -1;
export const RULE_MAX_LEVEL = 12;

/** Placeholders like "---" or "-" are how "no grade" tends to get typed in. */
export function isBlankGrade(grade: string | null | undefined): boolean {
  const g = (grade ?? "").trim();
  return g === "" || /^[-–—_.\s]+$/.test(g) || /^(n\/?a|nil|none)$/i.test(g);
}

export function bandFor(
  percentage: number | null,
  grade: string | null,
  level: number,
): AwardBand | "skip" {
  if (level <= PRE_PRIMARY_MAX_LEVEL) return "consolation";
  if (percentage === null || Number.isNaN(percentage)) {
    return isBlankGrade(grade) ? "consolation" : "skip";
  }
  if (percentage >= 90) return "first";
  if (percentage >= 80) return "second";
  if (percentage >= 70) return "third";
  return "consolation";
}
