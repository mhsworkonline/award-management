import { z } from "zod";

const uuid = z.string().uuid();
// Accepts a real string, "", undefined or null (client forms send all four
// depending on how the field was cleared) and collapses every empty case to
// null — the shape every optional text column expects on write.
const optionalText = z
  .string()
  .trim()
  .max(200)
  .nullable()
  .optional()
  .transform((v) => (v ? v : null));

export const SALUTATION_VALUES = ["Mr.", "Ms.", "Mrs.", "Miss", "Dr."] as const;
const optionalSalutation = z
  .union([z.enum(SALUTATION_VALUES), z.literal("")])
  .nullable()
  .optional()
  .transform((v) => (v ? v : null));

export const academicYearSchema = z.object({
  id: uuid.optional(),
  label: z.string().trim().min(1, "Label is required").max(50),
  start_date: z.string().trim().nullable().optional().transform((v) => (v ? v : null)),
  end_date: z.string().trim().nullable().optional().transform((v) => (v ? v : null)),
  is_active: z.boolean().default(false),
});

// Boards are a school-only concept (CBSE, State Board, ICSE …) — colleges
// don't have one. `applies_to` stays on the row for backward compatibility
// with the schema, but every board created through the app is school-only now.
export const boardSchema = z.object({
  id: uuid.optional(),
  name: z.string().trim().min(1, "Name is required").max(120),
  applies_to: z.enum(["school", "college", "both"]).default("school"),
});

export const mediumSchema = z.object({
  id: uuid.optional(),
  name: z.string().trim().min(1, "Name is required").max(120),
});

export const courseSchema = z.object({
  id: uuid.optional(),
  name: z.string().trim().min(1, "Name is required").max(120),
  structure_type: z.enum(["year", "semester"]).default("year"),
  total_periods: z.coerce.number().int().min(1).max(12),
});

/** level: -2 = LKG, -1 = UKG, 1..12 = Std 1..12 (0 skipped, reads oddly sorted). */
export const standardSchema = z.object({
  id: uuid.optional(),
  level: z.coerce.number().int().min(-2).max(12).refine((v) => v !== 0, "0 is not a valid level"),
  label: z.string().trim().min(1, "Label is required").max(50),
});

export const awardCategorySchema = z.object({
  id: uuid.optional(),
  name: z.string().trim().min(1, "Name is required").max(120),
  sort_order: z.coerce.number().int().min(0).max(999).default(0),
});

export const giftItemSchema = z.object({
  id: uuid.optional(),
  name: z.string().trim().min(1, "Name is required").max(160),
  sku: optionalText,
  unit_cost: z.coerce.number().min(0),
  quantity_on_hand: z.coerce.number().int().min(0),
});

/** Board and medium are both school-only — colleges carry neither. */
export const institutionSchema = z
  .object({
    id: uuid.optional(),
    name: z.string().trim().min(1, "Name is required").max(200),
    type: z.enum(["school", "college"]),
    board_id: z.string().uuid().nullable().optional().transform((v) => v ?? null),
    medium_id: z.string().uuid().nullable().optional().transform((v) => v ?? null),
    city: optionalText,
    contact_person: optionalText,
    contact_no: optionalText,
  })
  .transform((v) =>
    v.type === "college" ? { ...v, board_id: null, medium_id: null } : v,
  );

const optionalEmail = z
  .string()
  .trim()
  .toLowerCase()
  .email("Enter a valid email")
  .nullable()
  .optional()
  .or(z.literal(""))
  .transform((v) => (v ? v : null));

/** Persistent student identity only — no institution/year/standard here. */
export const studentSchema = z.object({
  id: uuid.optional(),
  salutation: optionalSalutation,
  first_name: z.string().trim().min(1, "First name is required").max(100),
  middle_name: optionalText,
  last_name: z.string().trim().min(1, "Last name is required").max(100),
  email: optionalEmail,
  contact_no: optionalText,
  remarks: z.string().trim().max(500).nullable().optional().transform((v) => (v ? v : null)),
});

/** One year's enrollment + performance for a student. */
export const academicRecordSchema = z
  .object({
    id: uuid.optional(),
    student_id: uuid,
    academic_year_id: uuid,
    institution_id: uuid,
    standard_id: z.string().uuid().nullable().optional().transform((v) => v ?? null),
    course_id: z.string().uuid().nullable().optional().transform((v) => v ?? null),
    period_no: z.coerce.number().int().min(1).max(12).nullable().optional().transform((v) => v ?? null),
    roll_no: optionalText,
    percentage: z.coerce.number().min(0).max(100).nullable().optional().transform((v) => v ?? null),
    grade: optionalText,
    rank: z.coerce.number().int().min(1).nullable().optional().transform((v) => v ?? null),
    remarks: z.string().trim().max(500).nullable().optional().transform((v) => (v ? v : null)),
  })
  .refine((v) => v.standard_id !== null || v.course_id !== null, {
    message: "Select a standard (school) or a course (college)",
    path: ["standard_id"],
  })
  .refine((v) => v.course_id === null || v.period_no !== null, {
    message: "Year/semester is required for a course",
    path: ["period_no"],
  });

/** Inline grade/rank edit from the bulk academic-records table — deliberately
 *  narrow so a fast per-row save can't touch placement fields by accident. */
export const gradeEntrySchema = z.object({
  id: uuid,
  percentage: z.coerce.number().min(0).max(100).nullable().optional().transform((v) => v ?? null),
  grade: optionalText,
  rank: z.coerce.number().int().min(1).nullable().optional().transform((v) => v ?? null),
});

export const studentAwardSchema = z.object({
  id: uuid.optional(),
  academic_record_id: uuid,
  award_category_id: uuid,
  subject_or_criteria: z.string().trim().max(200).nullable().optional().transform((v) => (v ? v : null)),
});

export const giftAllocationSchema = z.object({
  student_award_id: uuid,
  gift_item_id: uuid,
  quantity: z.coerce.number().int().min(1).max(999),
});

export const distributionSyncSchema = z.object({
  entries: z
    .array(
      z.object({
        local_uuid: uuid,
        distribution_id: uuid,
        status: z.enum(["pending", "distributed"]),
        distributed_at: z.string().nullable(),
      }),
    )
    .max(1000),
});

const OTHER = "__other__";
const courseStructure = z.enum(["year", "semester"]);

/** The public /apply form. Institution and course each accept either a real
 *  id or a free-text "Other" name (never both) — resolved to a real row only
 *  when staff approves. No id/student_id/academic_year_id here; those are
 *  resolved server-side. */
export const publicApplicationSchema = z
  .object({
    salutation: optionalSalutation,
    first_name: z.string().trim().min(1, "First name is required").max(100),
    middle_name: optionalText,
    last_name: z.string().trim().min(1, "Last name is required").max(100),
    email: z.string().trim().toLowerCase().min(1, "Email is required").email("Enter a valid email"),
    contact_no: optionalText,
    institution_id: z.string(),
    other_institution_name: optionalText,
    board_id: z.string().nullable().optional().transform((v) => v || null),
    other_board_name: optionalText,
    medium_id: z.string().nullable().optional().transform((v) => v || null),
    standard_id: z.string().nullable().optional().transform((v) => v || null),
    course_id: z.string().nullable().optional().transform((v) => v || null),
    other_course_name: optionalText,
    other_course_structure: z.union([courseStructure, z.literal("")]).nullable().optional().transform((v) => (v ? v : null)),
    period_no: z.coerce.number().int().min(1).max(12).nullable().optional().transform((v) => v ?? null),
    roll_no: optionalText,
    // Schools/colleges report results differently — some give percentage, some
    // grade, some both. Neither is individually required; superRefine below
    // requires at least one. z.coerce.number() alone would silently turn a
    // blank field into 0 (Number("") === 0) rather than "not provided", so an
    // empty/nullish value is normalized to undefined *before* coercion.
    percentage: z.preprocess(
      (v) => (v === "" || v === null || v === undefined ? undefined : v),
      z.coerce.number().min(0).max(100).optional(),
    ).transform((v) => v ?? null),
    grade: optionalText,
    notes: z.string().trim().max(1000).optional().transform((v) => (v ? v : null)),
    // Honeypot — real visitors never see or fill this field.
    website: z.string().max(200).optional(),
  })
  .superRefine((v, ctx) => {
    if (v.percentage === null && !v.grade) {
      ctx.addIssue({
        code: "custom",
        message: "Enter your percentage or grade (at least one is required)",
        path: ["percentage"],
      });
    }

    if (v.institution_id === OTHER) {
      if (!v.other_institution_name) {
        ctx.addIssue({ code: "custom", message: "Enter your institution's name", path: ["other_institution_name"] });
      }
    } else if (!v.institution_id) {
      ctx.addIssue({ code: "custom", message: "Select your institution", path: ["institution_id"] });
    }

    const usingOtherCourse = v.course_id === OTHER;
    const hasRealPlacement = Boolean(v.standard_id) || (v.course_id && v.course_id !== OTHER);

    if (v.standard_id) {
      if (v.board_id === OTHER) {
        if (!v.other_board_name) {
          ctx.addIssue({ code: "custom", message: "Enter your board's name", path: ["other_board_name"] });
        }
      } else if (!v.board_id) {
        ctx.addIssue({ code: "custom", message: "Select your board", path: ["board_id"] });
      }
      if (!v.medium_id) {
        ctx.addIssue({ code: "custom", message: "Select your medium of instruction", path: ["medium_id"] });
      }
    }

    if (!hasRealPlacement && !usingOtherCourse) {
      ctx.addIssue({ code: "custom", message: "Select a standard or a course", path: ["standard_id"] });
    }
    if (usingOtherCourse) {
      if (!v.other_course_name) {
        ctx.addIssue({ code: "custom", message: "Enter your course name", path: ["other_course_name"] });
      }
      if (!v.other_course_structure) {
        ctx.addIssue({ code: "custom", message: "Select year or semester", path: ["other_course_structure"] });
      }
      if (!v.period_no) {
        ctx.addIssue({ code: "custom", message: "Enter your current year/semester", path: ["period_no"] });
      }
    } else if (v.course_id && v.course_id !== OTHER && !v.period_no) {
      ctx.addIssue({ code: "custom", message: "Year/semester is required for a course", path: ["period_no"] });
    }
  })
  .transform((v) => ({
    ...v,
    institution_id: v.institution_id === OTHER ? null : v.institution_id || null,
    course_id: v.course_id === OTHER ? null : v.course_id || null,
    board_id: v.board_id === OTHER ? null : v.board_id || null,
  }));

export type PublicApplicationInput = z.input<typeof publicApplicationSchema>;
export const OTHER_OPTION_VALUE = OTHER;

/** Staff editing a submission before approval. institution_id/course_id are
 *  nullable here — an unresolved "Other" submission is a valid draft state;
 *  approveSubmission (not this schema) enforces that they're resolved before
 *  the record actually gets created. */
export const submissionEditSchema = z
  .object({
    id: uuid,
    salutation: optionalSalutation,
    first_name: z.string().trim().min(1, "First name is required").max(100),
    middle_name: optionalText,
    last_name: z.string().trim().min(1, "Last name is required").max(100),
    email: z.string().trim().toLowerCase().min(1, "Email is required").email("Enter a valid email"),
    contact_no: optionalText,
    institution_id: z.string().uuid().nullable().optional().transform((v) => v ?? null),
    other_institution_name: optionalText,
    board_id: z.string().uuid().nullable().optional().transform((v) => v ?? null),
    other_board_name: optionalText,
    medium_id: z.string().uuid().nullable().optional().transform((v) => v ?? null),
    standard_id: z.string().uuid().nullable().optional().transform((v) => v ?? null),
    course_id: z.string().uuid().nullable().optional().transform((v) => v ?? null),
    other_course_name: optionalText,
    other_course_structure: z.union([courseStructure, z.literal("")]).nullable().optional().transform((v) => (v ? v : null)),
    period_no: z.coerce.number().int().min(1).max(12).nullable().optional().transform((v) => v ?? null),
    roll_no: optionalText,
    // At least one of percentage/grade is required — see superRefine below.
    // (Empty string is normalized to undefined before coercion — Number("")
    // is 0, not NaN, so coercing a blank field directly would silently save 0%.)
    percentage: z.preprocess(
      (v) => (v === "" || v === null || v === undefined ? undefined : v),
      z.coerce.number().min(0).max(100).optional(),
    ).transform((v) => v ?? null),
    grade: optionalText,
    notes: z.string().trim().max(1000).nullable().optional().transform((v) => (v ? v : null)),
  })
  .superRefine((v, ctx) => {
    if (v.percentage === null && !v.grade) {
      ctx.addIssue({
        code: "custom",
        message: "Enter percentage or grade (at least one is required)",
        path: ["percentage"],
      });
    }
  });

const applicationFormFieldConfigSchema = z.object({
  show_salutation: z.boolean().default(true),
  show_middle_name: z.boolean().default(true),
  show_contact_no: z.boolean().default(true),
  show_roll_no: z.boolean().default(false),
  show_notes: z.boolean().default(true),
  show_attachments: z.boolean().default(true),
});

/** Creating/editing a public application form (Forms module). */
export const applicationFormSchema = z.object({
  id: uuid.optional(),
  title: z.string().trim().min(1, "Title is required").max(150),
  title_gu: z.string().trim().max(150).nullable().optional().transform((v) => (v ? v : null)),
  description: z.string().trim().max(500).nullable().optional().transform((v) => (v ? v : null)),
  description_gu: z.string().trim().max(500).nullable().optional().transform((v) => (v ? v : null)),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .min(1, "Slug is required")
    .max(60)
    .regex(/^[a-z0-9-]+$/, "Lowercase letters, numbers and hyphens only"),
  academic_year_id: uuid,
  is_enabled: z.boolean().default(true),
  field_config: applicationFormFieldConfigSchema.default({}),
});
export type ApplicationFormInput = z.input<typeof applicationFormSchema>;

/** Org branding — the name shown on the public /apply header. */
export const organizationBrandingSchema = z.object({
  app_name: z.string().trim().min(1, "Name is required").max(80),
});

export const academicRecordFilterSchema = z.object({
  q: z.string().trim().optional(),
  academic_year_id: z.string().uuid().optional(),
  institution_id: z.string().uuid().optional(),
  institution_type: z.enum(["school", "college"]).optional(),
  board_id: z.string().uuid().optional(),
  medium_id: z.string().uuid().optional(),
  standard_id: z.string().uuid().optional(),
  course_id: z.string().uuid().optional(),
  award_category_id: z.string().uuid().optional(),
  sort: z.string().optional(),
  dir: z.enum(["asc", "desc"]).optional(),
  page: z.coerce.number().int().min(1).optional(),
  size: z.coerce.number().int().min(1).max(200).optional(),
});

export type AcademicRecordFilters = z.infer<typeof academicRecordFilterSchema>;
export type StudentInput = z.input<typeof studentSchema>;
export type AcademicRecordInput = z.input<typeof academicRecordSchema>;
export type InstitutionInput = z.input<typeof institutionSchema>;

// Back-compat alias — several call sites still import this name.
export const studentFilterSchema = academicRecordFilterSchema;
export type StudentFilters = AcademicRecordFilters;
