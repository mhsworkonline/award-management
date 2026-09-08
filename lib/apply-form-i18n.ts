/** Fixed field captions on the public application form, stacked as
 *  "English / Gujarati". These are the same on every form, so they're
 *  maintained once here rather than re-entered per form — contrast with
 *  am_application_forms.title_gu/description_gu, which genuinely vary per
 *  form and are staff-editable from Forms → Edit form.
 *
 *  Best-effort standard Gujarati; if a phrasing reads wrong to a native
 *  speaker, it only needs fixing in one place. */
function bl(en: string, gu: string) {
  return `${en} / ${gu}`;
}

export const APPLY_LABELS = {
  salutation: bl("Salutation", "સંબોધન"),
  firstName: bl("First name", "પ્રથમ નામ"),
  // Kept short deliberately — the bilingual "Middle (father's) / પિતાનું નામ"
  // ran long enough to wrap to two lines in the 4-column desktop row while
  // its neighbors stayed on one, throwing the whole row out of alignment
  // (only visible on wider viewports — mobile stacks to one column, so it
  // never showed up there). The "father's/husband's" clarification moved to
  // the field's hint instead of living in the label itself.
  middleName: bl("Middle name", "મધ્યમ નામ"),
  lastName: bl("Last name", "અટક"),
  lanedaarName: bl("Lanedaar Name", "લાણેદારનું નામ"),
  email: bl("Email", "ઈમેલ"),
  contactNo: bl("Contact no", "સંપર્ક નંબર"),
  institutionType: bl("Institution type", "સંસ્થાનો પ્રકાર"),
  board: bl("Board", "બોર્ડ"),
  medium: bl("Medium of instruction", "શિક્ષણનું માધ્યમ"),
  // School/college replace the old generic "Institution" label — the
  // component picks whichever matches instType, so these two are always
  // used as a pair, never institution/otherInstitutionName directly.
  school: bl("School", "શાળા"),
  college: bl("College", "કૉલેજ"),
  otherSchoolName: bl("Your school's name", "તમારી શાળાનું નામ"),
  otherCollegeName: bl("Your college's name", "તમારી કૉલેજનું નામ"),
  otherBoardName: bl("Your board's name", "તમારા બોર્ડનું નામ"),
  course: bl("Course", "અભ્યાસક્રમ"),
  standard: bl("Standard", "ધોરણ"),
  year: bl("Year", "વર્ષ"),
  semester: bl("Semester", "સેમેસ્ટર"),
  rollNo: bl("Roll / GR no", "રોલ / જીઆર નંબર"),
  percentage: bl("Percentage", "ટકાવારી"),
  grade: bl("Grade", "ગ્રેડ"),
  notes: bl("Anything else you'd like to add?", "બીજું કંઈ ઉમેરવા માંગો છો?"),
  photograph: bl("Photograph of student", "વિદ્યાર્થીનો ફોટોગ્રાફ"),
  attachments: bl("Marksheets", "માર્કશીટ"),
  submit: bl("Submit application", "અરજી સબમિટ કરો"),
} as const;

/** Post-submit confirmation message — kept as separate en/gu strings (not
 *  joined via bl()) since it's rendered as two stacked lines, not an inline
 *  field caption. */
export const APPLY_CONFIRMATION = {
  en: "We will review and confirm your details. Save this code for any follow-up.",
  gu: "અમે તમારી વિગતોની સમીક્ષા કરીને પુષ્ટિ કરીશું. કોઈપણ અનુવર્તી માટે આ કોડ સાચવો.",
} as const;
