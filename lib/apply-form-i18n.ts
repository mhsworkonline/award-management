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
  // never showed up there).
  middleName: bl("Middle name", "મધ્યમ નામ"),
  lastName: bl("Last name", "અટક"),
  lanedaarName: bl("Lanedaar Name", "લાણેદારનું નામ"),
  email: bl("Email", "ઈમેલ"),
  contactNo: bl("Contact no", "સંપર્ક નંબર"),
  institutionType: bl("School/College", "શાળા/કૉલેજ"),
  board: bl("Board", "બોર્ડ"),
  medium: bl("Medium of instruction", "શિક્ષણનું માધ્યમ"),
  // School/college replace the old generic "Institution" label — the
  // component picks whichever matches instType, so these two are always
  // used as a pair, never institution/otherInstitutionName directly.
  school: bl("School Name", "શાળાનું નામ"),
  college: bl("College name", "કૉલેજનું નામ"),
  otherSchoolName: bl("Your school's name", "તમારી શાળાનું નામ"),
  otherCollegeName: bl("Your college's name", "તમારી કૉલેજનું નામ"),
  otherBoardName: bl("Your board's name", "તમારા બોર્ડનું નામ"),
  course: bl("Course", "અભ્યાસક્રમ"),
  standard: bl("Standard", "ધોરણ"),
  year: bl("Year", "વર્ષ"),
  semester: bl("Semester", "સેમેસ્ટર"),
  // Only shown for a custom ("Other — not listed") course, so these are a
  // separate trio from course/year/semester above, not reuses of them.
  yourCourseName: bl("Your course name", "તમારા અભ્યાસક્રમનું નામ"),
  yearOrSemesterQuestion: bl("Year or semester?", "વર્ષ કે સેમેસ્ટર?"),
  // "Current year" read as if it wanted a calendar year (e.g. 2026) rather
  // than "which year of the course" — renamed to make the actual question
  // unambiguous.
  // "Year of study" still got typed as a calendar year (2026) in practice.
  // Kept the label itself short (a longer one wraps and misaligns in this
  // FieldGrid, same issue Middle Name had) — the disambiguation now lives
  // in the field's hint + placeholder instead, right where the number
  // actually gets typed.
  yearOfStudy: bl("Which year?", "કયું વર્ષ?"),
  semesterOfStudy: bl("Which semester?", "કયું સેમેસ્ટર?"),
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

/** Every validation/error/hint message an applicant might actually need to
 *  read to fix something — as opposed to APPLY_LABELS' field captions.
 *  Same bilingual convention. Deliberately doesn't cover pure UI chrome
 *  (button verbs like "Remove", "Processing…") — those aren't content a
 *  mistake hinges on understanding, just interaction labels. */
export const APPLY_MESSAGES = {
  required: bl("Required", "જરૂરી"),
  optional: bl("Optional", "વૈકલ્પિક"),
  contactNoPlaceholder: bl("10-digit mobile number", "૧૦-અંકનો મોબાઇલ નંબર"),
  contactNoInvalid: bl("Enter a valid 10-digit mobile number", "માન્ય ૧૦-અંકનો મોબાઇલ નંબર દાખલ કરો"),
  periodRange: bl("Enter a value from 1 to 12", "૧ થી ૧૨ ની વચ્ચે કિંમત દાખલ કરો"),
  periodPlaceholder: bl("e.g. 1, 2, 3…", "દા.ત. ૧, ૨, ૩…"),
  yearHint: bl(
    "1 for 1st year, 2 for 2nd… — not the calendar year",
    "૧લા વર્ષ માટે ૧, ૨જા માટે ૨… — કેલેન્ડર વર્ષ નહીં",
  ),
  semesterHint: bl(
    "1 for 1st semester, 2 for 2nd… — not the calendar year",
    "૧લા સેમેસ્ટર માટે ૧, ૨જા માટે ૨… — કેલેન્ડર વર્ષ નહીં",
  ),
  percentageRange: bl("Enter a value from 0 to 100", "૦ થી ૧૦૦ ની વચ્ચે કિંમત દાખલ કરો"),
  percentageOrGradeHint: bl(
    "Percentage or Grade — at least one is required",
    "ટકાવારી અથવા ગ્રેડ — ઓછામાં ઓછું એક જરૂરી",
  ),
  attachmentsHint: (maxFiles: number) =>
    bl(`Up to ${maxFiles} files. PDF/DOCX up to 5MB each.`, `વધુમાં વધુ ${maxFiles} ફાઇલો. PDF/DOCX દરેક ૫MB સુધી.`),
  maxFiles: (n: number) => bl(`Maximum ${n} files`, `વધુમાં વધુ ${n} ફાઇલો`),
  fileTypeNotAllowed: (name: string) =>
    bl(`${name}: only images, PDF or DOCX are allowed`, `${name}: ફક્ત ઈમેજ, PDF અથવા DOCX માન્ય છે`),
  fileTooLarge: (name: string, mb: number) =>
    bl(`${name}: must be ${mb}MB or smaller`, `${name}: ${mb}MB અથવા તેથી નાની હોવી જોઈએ`),
  fileProcessFailed: (name: string) =>
    bl(
      `${name}: could not process this image — try a different file`,
      `${name}: આ ઈમેજ પર પ્રક્રિયા કરી શકાઈ નહીં — બીજી ફાઇલ પસંદ કરો`,
    ),
  marksheetRequired: bl(
    "Upload your marksheet — required to verify your application",
    "તમારી માર્કશીટ અપલોડ કરો — તમારી અરજી ચકાસવા માટે જરૂરી",
  ),
  photoTypeNotAllowed: bl("Only JPEG, PNG or WebP images are allowed", "ફક્ત JPEG, PNG અથવા WebP ઈમેજ માન્ય છે"),
  photoTooLarge: (mb: number) => bl(`Must be ${mb}MB or smaller`, `${mb}MB અથવા તેથી નાની હોવી જોઈએ`),
  photoProcessFailed: bl(
    "Could not process this image — try a different file",
    "આ ઈમેજ પર પ્રક્રિયા કરી શકાઈ નહીં — બીજી ફાઇલ પસંદ કરો",
  ),
  photoTooLargeAfterCompression: bl(
    "This image is too large even after compression — try a different file",
    "કમ્પ્રેશન પછી પણ આ ઈમેજ ઘણી મોટી છે — બીજી ફાઇલ પસંદ કરો",
  ),
  photoUploadFailed: bl("Upload failed — please try again", "અપલોડ નિષ્ફળ — ફરી પ્રયાસ કરો"),
  photoStillUploading: bl(
    "Still uploading — wait a moment and try again",
    "હજુ અપલોડ થઈ રહ્યું છે — થોડી રાહ જુઓ અને ફરી પ્રયાસ કરો",
  ),
  photoRequired: bl("Upload a photograph of the student", "વિદ્યાર્થીનો ફોટોગ્રાફ અપલોડ કરો"),
} as const;
