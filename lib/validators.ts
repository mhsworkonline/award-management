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

/** Persistent student identity only — no institution/year/standard here. */
export const studentSchema = z.object({
  id: uuid.optional(),
  first_name: z.string().trim().min(1, "First name is required").max(100),
  middle_name: optionalText,
  last_name: z.string().trim().min(1, "Last name is required").max(100),
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
