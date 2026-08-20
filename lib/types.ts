export type InstitutionType = "school" | "college";
export type AppliesTo = "school" | "college" | "both";
export type CourseStructure = "year" | "semester";
export type DistributionStatus = "pending" | "distributed";
export type SyncStatus = "synced" | "queued_offline";
export type AuditAction = "create" | "update" | "delete";
export type SubmissionStatus = "pending" | "approved" | "rejected";
export type GradeSource = "staff" | "self_reported";

export type AcademicYear = {
  id: string;
  org_id: string;
  label: string;
  start_date: string | null;
  end_date: string | null;
  is_active: boolean;
  created_at: string;
};

export type Board = {
  id: string;
  org_id: string;
  name: string;
  applies_to: AppliesTo;
  created_at: string;
};

export type Medium = { id: string; org_id: string; name: string; created_at: string };

export type Course = {
  id: string;
  org_id: string;
  name: string;
  structure_type: CourseStructure;
  total_periods: number;
  created_at: string;
};

export type Standard = {
  id: string;
  org_id: string;
  level: number;
  label: string;
  created_at: string;
};

export type AwardCategory = {
  id: string;
  org_id: string;
  name: string;
  sort_order: number;
  created_at: string;
};

export type GiftItem = {
  id: string;
  org_id: string;
  name: string;
  sku: string | null;
  unit_cost: number;
  quantity_on_hand: number;
  created_at: string;
};

export type Institution = {
  id: string;
  org_id: string;
  name: string;
  type: InstitutionType;
  board_id: string | null;
  medium_id: string | null;
  city: string | null;
  contact_person: string | null;
  contact_no: string | null;
  created_at: string;
  boards?: Pick<Board, "id" | "name"> | null;
  mediums?: Pick<Medium, "id" | "name"> | null;
};

/** Persistent student identity — does not carry institution/year/standard.
 *  Those live on AcademicRecord, one per student per academic year. */
export type Salutation = "Mr." | "Ms." | "Mrs." | "Miss" | "Dr.";
export const SALUTATIONS: Salutation[] = ["Mr.", "Ms.", "Mrs.", "Miss", "Dr."];

export type Student = {
  id: string;
  org_id: string;
  salutation: string | null;
  first_name: string;
  middle_name: string | null; // father's first name, by convention
  last_name: string;
  email: string | null;
  contact_no: string | null;
  remarks: string | null;
  created_at: string;
  updated_at: string;
};

export type AcademicRecord = {
  id: string;
  org_id: string;
  student_id: string;
  academic_year_id: string;
  institution_id: string;
  standard_id: string | null;
  course_id: string | null;
  period_no: number | null;
  roll_no: string | null;
  percentage: number | null;
  grade: string | null;
  rank: number | null;
  grade_source: GradeSource;
  remarks: string | null;
  created_at: string;
  updated_at: string;
};

/** The primary "roster" row — an enrollment for one year, with the student and
 *  institution embedded. This is what list/filter views actually display. */
export type AcademicRecordRow = AcademicRecord & {
  students?: Pick<Student, "id" | "salutation" | "first_name" | "middle_name" | "last_name" | "email" | "contact_no"> | null;
  institutions?: Pick<Institution, "id" | "name" | "type"> | null;
  academic_years?: Pick<AcademicYear, "id" | "label"> | null;
  standards?: Pick<Standard, "id" | "label"> | null;
  courses?: Pick<Course, "id" | "name" | "structure_type"> | null;
  student_awards?: Array<{
    id: string;
    subject_or_criteria: string | null;
    award_categories?: Pick<AwardCategory, "id" | "name"> | null;
  }>;
};

/** Student detail view — the person plus every year they've been enrolled. */
export type StudentWithRecords = Student & {
  academic_records?: AcademicRecordRow[];
};

export type StudentAward = {
  id: string;
  org_id: string;
  academic_record_id: string;
  award_category_id: string;
  subject_or_criteria: string | null;
  created_at: string;
};

export type GiftAllocation = {
  id: string;
  org_id: string;
  student_award_id: string;
  gift_item_id: string;
  quantity: number;
  created_at: string;
};

export type DistributionRecord = {
  id: string;
  org_id: string;
  gift_allocation_id: string;
  status: DistributionStatus;
  distributed_at: string | null;
  distributed_by: string | null;
  sync_status: SyncStatus;
  local_uuid: string | null;
  updated_at: string;
};

/** Flattened row for the distribution check-off screen. */
export type DistributionRow = {
  id: string;
  gift_allocation_id: string;
  status: DistributionStatus;
  distributed_at: string | null;
  distributed_by: string | null;
  sync_status: SyncStatus;
  quantity: number;
  gift_name: string;
  student_id: string;
  student_name: string;
  father_name: string | null; // = middle_name
  institution_name: string;
  institution_type: InstitutionType;
  academic_year_id: string;
  academic_year_label: string;
  award_category: string;
  placement: string;
};

export type AuditLog = {
  id: number;
  org_id: string;
  entity_name: string;
  entity_id: string | null;
  action: AuditAction;
  actor: string | null;
  diff_json: Record<string, unknown> | null;
  created_at: string;
};

export type Lookups = {
  academicYears: AcademicYear[];
  boards: Board[];
  mediums: Medium[];
  courses: Course[];
  standards: Standard[];
  awardCategories: AwardCategory[];
  giftItems: GiftItem[];
  institutions: Pick<Institution, "id" | "name" | "type" | "board_id" | "medium_id">[];
};

/** Options exposed to the unauthenticated /apply form via a security-definer
 *  RPC — deliberately a narrower shape than Lookups (no gift items, award
 *  categories, or institution contact details). */
export type PublicFormOptions = {
  institutions: { id: string; name: string; type: InstitutionType; board_id: string | null }[];
  boards: { id: string; name: string }[];
  mediums: { id: string; name: string }[];
  standards: { id: string; label: string; level: number }[];
  courses: { id: string; name: string; structure_type: CourseStructure; total_periods: number }[];
  academicYear: { id: string; label: string } | null;
};

export type PublicSubmission = {
  id: string;
  org_id: string;
  form_id: string | null;
  salutation: string | null;
  first_name: string;
  middle_name: string | null;
  last_name: string;
  email: string | null;
  contact_no: string | null;
  institution_id: string | null;
  other_institution_name: string | null;
  board_id: string | null;
  other_board_name: string | null;
  medium_id: string | null;
  academic_year_id: string;
  standard_id: string | null;
  course_id: string | null;
  other_course_name: string | null;
  other_course_structure: CourseStructure | null;
  period_no: number | null;
  roll_no: string | null;
  percentage: number | null;
  grade: string | null;
  notes: string | null;
  status: SubmissionStatus;
  reference_code: string;
  student_id: string | null;
  academic_record_id: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  rejection_reason: string | null;
  created_at: string;
};

export type PublicSubmissionRow = PublicSubmission & {
  institutions?: Pick<Institution, "id" | "name" | "type"> | null;
  academic_years?: Pick<AcademicYear, "id" | "label"> | null;
  standards?: Pick<Standard, "id" | "label"> | null;
  courses?: Pick<Course, "id" | "name" | "structure_type"> | null;
  boards?: Pick<Board, "id" | "name"> | null;
  mediums?: Pick<Medium, "id" | "name"> | null;
  application_forms?: Pick<ApplicationForm, "id" | "title" | "slug"> | null;
  attachments?: SubmissionAttachment[];
};

export type SubmissionAttachment = {
  id: string;
  submission_id: string;
  file_path: string;
  file_name: string;
  mime_type: string;
  size_bytes: number;
  created_at: string;
};

export type ApplicationForm = {
  id: string;
  org_id: string;
  slug: string;
  title: string;
  academic_year_id: string;
  is_enabled: boolean;
  created_by: string | null;
  created_at: string;
};

export type ApplicationFormRow = ApplicationForm & {
  academic_years?: Pick<AcademicYear, "id" | "label"> | null;
  submission_count?: number;
};

/** What am_resolve_application_form returns to the (unauthenticated) /apply page. */
export type ResolvedForm = {
  id: string;
  slug: string;
  title: string;
  is_enabled: boolean;
  academicYear: { id: string; label: string };
} | null;

export type ActionResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; error: string; fieldErrors?: Record<string, string[]> };
