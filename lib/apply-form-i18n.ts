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
  middleName: bl("Middle (father's)", "પિતાનું નામ"),
  lastName: bl("Last name", "અટક"),
  email: bl("Email", "ઈમેલ"),
  contactNo: bl("Contact no", "સંપર્ક નંબર"),
  contactNoHint: bl("Your own or a parent's mobile number", "તમારો અથવા વાલીનો મોબાઇલ નંબર"),
  institutionType: bl("Institution type", "સંસ્થાનો પ્રકાર"),
  board: bl("Board", "બોર્ડ"),
  medium: bl("Medium of instruction", "શિક્ષણનું માધ્યમ"),
  institution: bl("Institution", "સંસ્થા"),
  otherInstitutionName: bl("Your institution's name", "તમારી સંસ્થાનું નામ"),
  course: bl("Course", "અભ્યાસક્રમ"),
  standard: bl("Standard", "ધોરણ"),
  year: bl("Year", "વર્ષ"),
  semester: bl("Semester", "સેમેસ્ટર"),
  rollNo: bl("Roll / GR no", "રોલ / જીઆર નંબર"),
  percentage: bl("Percentage", "ટકાવારી"),
  grade: bl("Grade", "ગ્રેડ"),
  gradeHint: bl(
    "Provide your percentage, grade, or both — at least one is required.",
    "તમારી ટકાવારી, ગ્રેડ અથવા બંને આપો — ઓછામાં ઓછું એક જરૂરી છે.",
  ),
  notes: bl("Anything else you'd like to add?", "બીજું કંઈ ઉમેરવા માંગો છો?"),
  attachments: bl("Marksheets", "માર્કશીટ"),
  submit: bl("Submit application", "અરજી સબમિટ કરો"),
} as const;
