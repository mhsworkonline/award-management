/** Every table a full backup covers, in an order that's both safe to
 *  restore in (each table only ever depends on ones before it — verified
 *  against the live foreign-key graph, not re-derived from memory across
 *  31 migrations) and reasonable to read in for export.
 *
 *  Deliberately excludes:
 *  - am_persons — a mirror of am_students maintained automatically by a
 *    database trigger (see 0021_add_persons.sql). Restoring am_students
 *    regenerates it as a side effect; restoring it directly would either
 *    duplicate or be silently overwritten, since the trigger always sets
 *    person_id itself on insert regardless of what's provided.
 *  - am_profiles — tied to auth.users, which a backup fundamentally can't
 *    restore (Supabase Auth passwords are hashed, not exportable). After a
 *    restore, an admin re-creates staff accounts via Settings -> Users &
 *    Roles; there's nothing here for a stale profiles row to usefully do.
 *
 *  `filterColumn: null` is only for am_permissions, which has no org_id
 *  column of its own (only role_id -> am_roles) — safe to take unfiltered
 *  since this is a single-org deployment (see lib/constants.ts). */
export type BackupTable = {
  table: string;
  filterColumn: "id" | "org_id" | null;
};

export const BACKUP_TABLES: BackupTable[] = [
  { table: "am_organizations", filterColumn: "id" },
  { table: "am_academic_years", filterColumn: "org_id" },
  { table: "am_boards", filterColumn: "org_id" },
  { table: "am_mediums", filterColumn: "org_id" },
  { table: "am_courses", filterColumn: "org_id" },
  { table: "am_standards", filterColumn: "org_id" },
  { table: "am_streams", filterColumn: "org_id" },
  { table: "am_award_categories", filterColumn: "org_id" },
  { table: "am_gift_items", filterColumn: "org_id" },
  { table: "am_institutions", filterColumn: "org_id" },
  { table: "am_roles", filterColumn: "org_id" },
  { table: "am_permissions", filterColumn: null },
  { table: "am_students", filterColumn: "org_id" },
  { table: "am_academic_records", filterColumn: "org_id" },
  { table: "am_student_awards", filterColumn: "org_id" },
  { table: "am_gift_allocations", filterColumn: "org_id" },
  { table: "am_distribution_records", filterColumn: "org_id" },
  { table: "am_application_forms", filterColumn: "org_id" },
  { table: "am_public_submissions", filterColumn: "org_id" },
  { table: "am_submission_attachments", filterColumn: "org_id" },
  { table: "am_short_links", filterColumn: "org_id" },
  { table: "am_audit_logs", filterColumn: "org_id" },
  { table: "am_error_logs", filterColumn: "org_id" },
];
