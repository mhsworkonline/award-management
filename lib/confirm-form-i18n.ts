/** Fixed captions on the public "confirm your details" page (/confirm),
 *  stacked as "English / Gujarati" — same bilingual convention as
 *  apply-form-i18n.ts (see its header comment), kept in its own file rather
 *  than added there since this is a separate page with its own labels, not
 *  a variant of the application form.
 *
 *  Best-effort standard Gujarati; if a phrasing reads wrong to a native
 *  speaker, it only needs fixing in one place. */
function bl(en: string, gu: string) {
  return `${en} / ${gu}`;
}

export const CONFIRM_LABELS = {
  pageTitle: bl("Confirm your details", "તમારી વિગતો ચકાસો"),
  pageIntro: bl(
    "Enter your registered mobile number to see the details we have on file.",
    "અમારી પાસે નોંધાયેલ વિગતો જોવા તમારો નોંધાયેલ મોબાઇલ નંબર દાખલ કરો.",
  ),
  chooseStudent: bl("Tap a name to check their details.", "વિગતો ચકાસવા નામ પર ટેપ કરો."),
  backToList: bl("Back to list", "યાદી પર પાછા જાઓ"),
  done: bl("Done", "થઈ ગયું"),
  contactNo: bl("Registered mobile number", "નોંધાયેલ મોબાઇલ નંબર"),
  lookupSubmit: bl("Show my details", "મારી વિગતો બતાવો"),
  name: bl("Name", "નામ"),
  institution: bl("Institution", "સંસ્થા"),
  standardOrCourse: bl("Standard / Course", "ધોરણ / અભ્યાસક્રમ"),
  percentage: bl("Percentage", "ટકાવારી"),
  grade: bl("Grade", "ગ્રેડ"),
  email: bl("Email", "ઈમેલ"),
  contactOnFile: bl("Mobile number", "મોબાઇલ નંબર"),
  correctionLabel: bl("Anything need correcting?", "કંઈ સુધારવાની જરૂર છે?"),
  correctionHint: bl(
    "Leave this blank if everything above is correct.",
    "જો ઉપરની બધી વિગતો સાચી હોય તો આ ખાલી રાખો.",
  ),
  correctionPlaceholder: bl(
    "Tell us what's wrong and what it should be instead…",
    "શું ખોટું છે અને તેના બદલે શું હોવું જોઈએ તે અમને જણાવો…",
  ),
  confirmCorrect: bl("Looks correct", "બરાબર છે"),
  sendCorrection: bl("Send correction", "સુધારો મોકલો"),
} as const;

/** Shown once the lookup succeeds or a confirmation/correction is sent —
 *  kept as separate en/gu strings (not joined via bl()) since each is
 *  rendered as its own stacked line, not an inline field caption. */
export const CONFIRM_MESSAGES_BLOCK = {
  confirmedEn: "Thanks for confirming — nothing further needed.",
  confirmedGu: "ચકાસવા બદલ આભાર — હવે કંઈ કરવાની જરૂર નથી.",
  correctionEn: "Thanks — we've received your correction and will follow up.",
  correctionGu: "આભાર — તમારો સુધારો મળી ગયો છે, અમે ટૂંક સમયમાં સંપર્ક કરીશું.",
} as const;

export const CONFIRM_MESSAGES = {
  required: bl("Required", "જરૂરી"),
  contactNoInvalid: bl("Enter a valid 10-digit mobile number", "માન્ય ૧૦-અંકનો મોબાઇલ નંબર દાખલ કરો"),
  notFound: bl(
    "We couldn't find this number. It may be registered under a different number — please contact us.",
    "આ નંબર મળ્યો નહીં. તે અલગ નંબર પર નોંધાયેલ હોઈ શકે છે — કૃપા કરીને અમારો સંપર્ક કરો.",
  ),
  studentsFound: (n: number) =>
    bl(`${n} students found for this number`, `આ નંબર પર ${n} વિદ્યાર્થી મળ્યા`),
  lookingUp: bl("Checking…", "તપાસ થઈ રહી છે…"),
  sending: bl("Sending…", "મોકલાઈ રહ્યું છે…"),
  checkAnother: bl("Check another number", "બીજો નંબર તપાસો"),
  notOpen: bl(
    "Confirmations aren't open right now. Please check back later.",
    "હાલમાં ચકાસણી ખુલ્લી નથી. કૃપા કરીને પછીથી તપાસો.",
  ),
} as const;
