/** Physical table names.
 *
 *  This app shares its Postgres schema with other applications, so every table
 *  is prefixed `am_`. Queries reference this map rather than literals, so the
 *  prefix is defined once and the rest of the codebase keeps working in logical
 *  names (`T.students`, not `"am_students"`).
 *
 *  Supabase embedded selects use PostgREST aliases (`students:am_students(...)`)
 *  so response shapes stay in logical names too — see REL below. */
export const T = {
  organizations: "am_organizations",
  academicYears: "am_academic_years",
  boards: "am_boards",
  mediums: "am_mediums",
  courses: "am_courses",
  standards: "am_standards",
  streams: "am_streams",
  awardCategories: "am_award_categories",
  institutions: "am_institutions",
  persons: "am_persons",
  students: "am_students",
  roles: "am_roles",
  permissions: "am_permissions",
  profiles: "am_profiles",
  academicRecords: "am_academic_records",
  studentAwards: "am_student_awards",
  giftItems: "am_gift_items",
  giftAllocations: "am_gift_allocations",
  distributionRecords: "am_distribution_records",
  auditLogs: "am_audit_logs",
  errorLogs: "am_error_logs",
  publicSubmissions: "am_public_submissions",
  applicationForms: "am_application_forms",
  submissionAttachments: "am_submission_attachments",
  shortLinks: "am_short_links",
  dataConfirmations: "am_data_confirmations",
} as const;

/** Storage bucket for public-application attachments — private, anon can only
 *  insert into it (see migration), never list or read. */
export const ATTACHMENTS_BUCKET = "am-submission-attachments";

/** Storage bucket for the org logo — public (readable by anyone via its plain
 *  URL, no signing), writable only by authenticated staff. */
export const BRANDING_BUCKET = "am-branding";

/** Storage bucket for student photographs — public (readable by anyone via
 *  its plain URL, no signing, so thumbnails render instantly with no signed-URL
 *  round trip) but writable only by authenticated staff or, for the /apply
 *  form, anon insert (see migration). */
export const STUDENT_PHOTOS_BUCKET = "am-student-photos";

/** Aliased embedded-relation fragments for `.select()`.
 *  `institutions:am_institutions` keeps the JSON key as `institutions`. */
export const REL = {
  institutions: `institutions:${T.institutions}`,
  academicYears: `academic_years:${T.academicYears}`,
  standards: `standards:${T.standards}`,
  streams: `streams:${T.streams}`,
  courses: `courses:${T.courses}`,
  boards: `boards:${T.boards}`,
  mediums: `mediums:${T.mediums}`,
  students: `students:${T.students}`,
  academicRecords: `academic_records:${T.academicRecords}`,
  studentAwards: `student_awards:${T.studentAwards}`,
  awardCategories: `award_categories:${T.awardCategories}`,
  giftAllocations: `gift_allocations:${T.giftAllocations}`,
  giftItems: `gift_items:${T.giftItems}`,
  roles: `roles:${T.roles}`,
  distributionRecords: `distribution_records:${T.distributionRecords}`,
} as const;

/** Postgres function names. */
export const FN = {
  allocateGift: "am_allocate_gift",
  publicFormOptions: "am_public_form_options",
  submitPublicApplication: "am_submit_public_application",
  resolveApplicationForm: "am_resolve_application_form",
  registerAttachment: "am_register_submission_attachment",
  publicBranding: "am_public_branding",
  getLookups: "am_get_lookups",
  resolveShortLink: "am_resolve_short_link",
  listSubmissions: "am_list_submissions",
  getSubmissionLookups: "am_get_submission_lookups",
  getSubmissionByRecord: "am_get_submission_by_record",
  findStudentByName: "am_find_student_by_name",
  submissionCounts: "am_submission_counts",
  resolveConfirmForm: "am_resolve_confirm_form",
  confirmLookup: "am_confirm_lookup_by_mobile",
  submitDataConfirmation: "am_submit_data_confirmation",
  listDataConfirmations: "am_list_data_confirmations",
} as const;

/** Logical entity name → physical table, for the config CRUD surface. */
export const CONFIG_TABLES = {
  academic_years: T.academicYears,
  boards: T.boards,
  mediums: T.mediums,
  courses: T.courses,
  standards: T.standards,
  streams: T.streams,
  award_categories: T.awardCategories,
  gift_items: T.giftItems,
  institutions: T.institutions,
} as const;
