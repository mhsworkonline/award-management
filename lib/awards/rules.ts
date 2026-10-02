/** Registry of "Assign Awards" rules — one (for now) per institution type.
 *  Picking an institution type in the UI narrows which rules are offered, so
 *  adding a second rule for a type later is just another entry here. */

import { COLLEGE_RANK_FLOOR } from "./college-rank-rule";

export type AwardRuleKey = "school_percentage" | "college_rank_1";

export const AWARD_RULES: {
  key: AwardRuleKey;
  institutionType: "school" | "college";
  label: string;
  description: string;
}[] = [
  {
    key: "school_percentage",
    institutionType: "school",
    label: "Percentage bands",
    description:
      "Play Group, Nursery, LKG and UKG all get Consolation. Std 1 to Std 12, by percentage: 90%+ gets " +
      "1st Rank, 80–89.99% gets 2nd Rank, 70–79.99% gets 3rd Rank, below 70% gets Consolation. No " +
      "percentage and no grade gets Consolation.",
  },
  {
    key: "college_rank_1",
    institutionType: "college",
    label: "Rule 1",
    description:
      `Within each course and year (BCom Year 1 judged separately from BCom Year 2, and so on), students ` +
      `scoring above ${COLLEGE_RANK_FLOOR}% are ranked against each other: the highest gets 1st Rank, the ` +
      "next gets 2nd Rank, the next gets 3rd Rank — a tie shares the same rank, and the next distinct " +
      `score takes the rank right after. ${COLLEGE_RANK_FLOOR}% or below gets Consolation.`,
  },
];

export function rulesForInstitutionType(type: "school" | "college") {
  return AWARD_RULES.filter((r) => r.institutionType === type);
}

export function ruleByKey(key: AwardRuleKey) {
  const rule = AWARD_RULES.find((r) => r.key === key);
  if (!rule) throw new Error(`Unknown award rule: ${key}`);
  return rule;
}
