"use server";

import { revalidatePath } from "next/cache";
import { canAccess, requirePermission } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { ORG_ID } from "@/lib/constants";
import { buildDiff, writeAudit } from "@/lib/audit";
import { friendly, message, NOTHING_DELETED } from "@/lib/actions/crud";
import { submissionEditSchema } from "@/lib/validators";
import { normalizeName } from "@/lib/utils";
import { findDuplicateStudents } from "@/lib/data/students";
import { ATTACHMENTS_BUCKET, T } from "@/lib/tables";
import { ALLOWED_ATTACHMENT_TYPES, MAX_ATTACHMENTS, MAX_ATTACHMENT_BYTES } from "@/lib/attachments";
import type { ActionResult, AuditLog, SubmissionStatus } from "@/lib/types";

function revalidateAll() {
  revalidatePath("/submissions");
  revalidatePath("/students");
  revalidatePath("/academic-records");
  revalidatePath("/dashboard");
}

/** The same "is this actually placeable" bar approving has always enforced —
 *  reused when editing could just as easily un-resolve one of these (e.g.
 *  clearing institution_id by mistake) on a submission that's already
 *  approved and syncing straight into the roster. */
function validatePlacement(sub: {
  institution_id: string | null;
  standard_id: string | null;
  course_id: string | null;
  board_id: string | null;
  medium_id: string | null;
}): string | null {
  if (!sub.institution_id) return "Resolve the custom institution to a real one before saving";
  if (!sub.standard_id && !sub.course_id) return "Resolve the custom course to a real one before saving";
  if (sub.standard_id && !sub.board_id) return "Resolve the custom board to a real one before saving";
  if (sub.standard_id && !sub.medium_id) return "Select a medium of instruction before saving";
  return null;
}

/** Same possible-duplicate warning shown on the Add Student page, reused here
 *  so staff see it before approving a public submission too. */
export async function checkSubmissionDuplicates(input: {
  first_name: string;
  middle_name?: string | null;
  last_name: string;
}) {
  try {
    await requirePermission("submissions", "read");
    // Elevated on purpose - see findDuplicateStudents. Only ever returns names
    // matching this one applicant's own name.
    const rows = await findDuplicateStudents(input, createAdminClient());
    return {
      ok: true as const,
      data: rows.map((r) => [r.first_name, r.middle_name, r.last_name].filter(Boolean).join(" ")),
    };
  } catch (e) {
    return { ok: false as const, error: message(e) };
  }
}

/** Edits a submission's fields, at any status — not just Pending. A
 *  submission that's already Approved has a real student + academic record
 *  riding on it, so an edit there also pushes the correction into both
 *  rather than letting the submission and the live roster disagree. */
export async function updateSubmission(raw: unknown): Promise<ActionResult<null>> {
  const parsed = submissionEditSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      error: "Please correct the highlighted fields",
      fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
    };
  }

  const { id, ...values } = parsed.data;

  try {
    const { supabase, actor } = await requirePermission("submissions", "update");

    const { data: before, error: beforeError } = await supabase
      .from(T.publicSubmissions)
      .select("*")
      .eq("id", id)
      .eq("org_id", ORG_ID)
      .single();
    if (beforeError || !before) return { ok: false, error: "Submission not found" };

    if (before.status === "approved") {
      const placementError = validatePlacement(values);
      if (placementError) return { ok: false, error: placementError };
    }

    const { error } = await supabase
      .from(T.publicSubmissions)
      .update(values)
      .eq("id", id)
      .eq("org_id", ORG_ID);
    if (error) return { ok: false, error: friendly(error.message) };

    if (before.status === "approved" && before.student_id && before.academic_record_id) {
      // Pushing a correction into the roster is part of editing a submission,
      // so it's allowed by Submissions: Update alone - done with the elevated
      // client, since the reviewer may not have Students/Academic Records
      // access of their own (RLS would silently update zero rows).
      const admin = createAdminClient();
      const { error: studentError } = await admin
        .from(T.students)
        .update({
          salutation: values.salutation ?? null,
          first_name: values.first_name,
          middle_name: values.middle_name ?? null,
          last_name: values.last_name,
          lanedaar_name: values.lanedaar_name ?? null,
          email: values.email,
          contact_no: values.contact_no,
        })
        .eq("id", before.student_id);
      if (studentError) return { ok: false, error: friendly(studentError.message) };

      const { error: recordError } = await admin
        .from(T.academicRecords)
        .update({
          institution_id: values.institution_id,
          standard_id: values.standard_id,
          stream_id: values.stream_id,
          course_id: values.course_id,
          period_no: values.period_no,
          roll_no: values.roll_no,
          percentage: values.percentage,
          grade: values.grade,
          remarks: values.notes,
        })
        .eq("id", before.academic_record_id);
      if (recordError) return { ok: false, error: friendly(recordError.message) };

      await writeAudit(supabase, {
        entity: "students",
        entityId: before.student_id,
        action: "update",
        actor,
        diff: { synced_from_submission_edit: id },
      });
      await writeAudit(supabase, {
        entity: "academic_records",
        entityId: before.academic_record_id,
        action: "update",
        actor,
        diff: { synced_from_submission_edit: id },
      });
    }

    await writeAudit(supabase, {
      entity: "public_submissions",
      entityId: id,
      action: "update",
      actor,
      diff: buildDiff(before, { ...before, ...values }),
    });

    revalidateAll();
    return { ok: true, data: null };
  } catch (e) {
    return { ok: false, error: message(e) };
  }
}

/** Approve: find-or-create the persistent student by exact normalized-name
 *  match (same rule commitImport uses), create their enrollment for the
 *  submission's institution/year/standard, and mark the submission approved.
 *  A percentage/grade the student typed in themselves is tagged
 *  grade_source='self_reported' so it's never silently indistinguishable
 *  from a staff-verified number in Grade Entry or award suggestions. */
export async function approveSubmission(
  id: string,
  note: string,
): Promise<ActionResult<{ studentId: string; recordId: string }>> {
  const trimmedNote = note.trim();
  if (!trimmedNote) return { ok: false, error: "A note is required" };

  try {
    // Approving needs only Submissions: Update - not Students/Academic
    // Records: Create. "Can review submissions" is what makes someone a
    // reviewer; requiring general create rights on the roster would hand
    // them the ability to add students by hand too. The student and their
    // enrollment are created with the elevated client below, after this check.
    const { supabase, actor } = await requirePermission("submissions", "update");
    const admin = createAdminClient();

    // Reachable from Pending, Doubtful or Rejected — approving is the one
    // transition allowed from anywhere, since it only ever creates data,
    // never removes it. Not reachable a second time from Approved itself,
    // since that would try to create a duplicate student/academic record.
    const { data: sub, error: subError } = await supabase
      .from(T.publicSubmissions)
      .select("*")
      .eq("id", id)
      .eq("org_id", ORG_ID)
      .neq("status", "approved")
      .single();
    if (subError || !sub) return { ok: false, error: "Submission not found or already approved" };

    const placementError = validatePlacement(sub);
    if (placementError) return { ok: false, error: placementError };

    // Read every student, in pages - a single request is capped at 1000 rows,
    // and a match missed past that would create a duplicate student.
    type StudentMatch = {
      id: string;
      salutation: string | null;
      first_name: string;
      middle_name: string | null;
      last_name: string;
      lanedaar_name: string | null;
      email: string | null;
      photo_path: string | null;
    };
    const existingStudents: StudentMatch[] = [];
    for (let from = 0; ; from += 1000) {
      const { data: page, error: pageError } = await admin
        .from(T.students)
        .select("id, salutation, first_name, middle_name, last_name, lanedaar_name, email, photo_path")
        .eq("org_id", ORG_ID)
        .order("id")
        .range(from, from + 999);
      if (pageError) return { ok: false, error: friendly(pageError.message) };
      existingStudents.push(...((page ?? []) as StudentMatch[]));
      if (!page || page.length < 1000) break;
    }

    const key = `${normalizeName(sub.first_name)}|${normalizeName(sub.middle_name)}|${normalizeName(sub.last_name)}`;
    const match = existingStudents.find(
      (s) => `${normalizeName(s.first_name)}|${normalizeName(s.middle_name)}|${normalizeName(s.last_name)}` === key,
    );

    let studentId = match?.id as string | undefined;

    if (studentId) {
      // Backfill fields the existing record never had — never overwrite ones it does.
      const backfill: Record<string, unknown> = {};
      if (!match?.email && sub.email) backfill.email = sub.email;
      if (!match?.salutation && sub.salutation) backfill.salutation = sub.salutation;
      if (!match?.photo_path && sub.photo_path) backfill.photo_path = sub.photo_path;
      if (!match?.lanedaar_name && sub.lanedaar_name) backfill.lanedaar_name = sub.lanedaar_name;
      if (Object.keys(backfill).length > 0) {
        await admin.from(T.students).update(backfill).eq("id", studentId);
      }
    }

    if (!studentId) {
      const { data: newStudent, error: studentError } = await admin
        .from(T.students)
        .insert({
          org_id: ORG_ID,
          salutation: sub.salutation,
          first_name: sub.first_name,
          middle_name: sub.middle_name,
          last_name: sub.last_name,
          lanedaar_name: sub.lanedaar_name,
          email: sub.email,
          contact_no: sub.contact_no,
          photo_path: sub.photo_path,
        })
        .select("id")
        .single();
      if (studentError) return { ok: false, error: friendly(studentError.message) };
      studentId = newStudent.id as string;

      await writeAudit(supabase, {
        entity: "students",
        entityId: studentId,
        action: "create",
        actor,
        diff: buildDiff(null, newStudent),
      });
    }

    const { data: record, error: recordError } = await admin
      .from(T.academicRecords)
      .insert({
        org_id: ORG_ID,
        student_id: studentId,
        institution_id: sub.institution_id,
        academic_year_id: sub.academic_year_id,
        standard_id: sub.standard_id,
        stream_id: sub.stream_id,
        course_id: sub.course_id,
        period_no: sub.period_no,
        roll_no: sub.roll_no,
        percentage: sub.percentage,
        grade: sub.grade,
        grade_source: "self_reported",
        remarks: sub.notes,
      })
      .select()
      .single();

    if (recordError) return { ok: false, error: friendly(recordError.message) };

    const { error: updateError } = await supabase
      .from(T.publicSubmissions)
      .update({
        status: "approved",
        student_id: studentId,
        academic_record_id: record.id,
        reviewed_by: actor,
        reviewed_at: new Date().toISOString(),
        review_note: trimmedNote,
      })
      .eq("id", id);
    if (updateError) return { ok: false, error: friendly(updateError.message) };

    await writeAudit(supabase, {
      entity: "public_submissions",
      entityId: id,
      action: "update",
      actor,
      diff: { status: { from: sub.status, to: "approved" }, note: trimmedNote },
    });
    await writeAudit(supabase, {
      entity: "academic_records",
      entityId: record.id,
      action: "create",
      actor,
      diff: { approved_from_submission: id, self_reported: true },
    });

    revalidateAll();
    return { ok: true, data: { studentId, recordId: record.id } };
  } catch (e) {
    return { ok: false, error: message(e) };
  }
}

/** Staff-only download link — the bucket has no public/anon read policy, so
 *  every view goes through a short-lived signed URL generated server-side. */
export async function getAttachmentSignedUrl(attachmentId: string): Promise<ActionResult<{ url: string }>> {
  try {
    const { supabase } = await requirePermission("submissions", "read");
    const { data: attachment, error: attError } = await supabase
      .from(T.submissionAttachments)
      .select("file_path")
      .eq("id", attachmentId)
      .single();
    if (attError || !attachment) return { ok: false, error: "Attachment not found" };

    const { data, error } = await supabase.storage
      .from(ATTACHMENTS_BUCKET)
      .createSignedUrl(attachment.file_path, 120);
    if (error || !data) return { ok: false, error: error?.message ?? "Could not generate link" };

    return { ok: true, data: { url: data.signedUrl } };
  } catch (e) {
    return { ok: false, error: message(e) };
  }
}

/** Registers a staff-added attachment. The file itself is already in Storage
 *  (uploaded client-side under the `authenticated` role, which now has an
 *  insert policy on the bucket) — this re-validates count/size/type server-side
 *  the same way the public submit path does, so staff and applicants are held
 *  to the identical rule regardless of which door they came through. */
export async function addSubmissionAttachment(input: {
  submissionId: string;
  filePath: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
}): Promise<ActionResult<{ id: string }>> {
  try {
    const { supabase, actor } = await requirePermission("submissions", "update");

    const { count } = await supabase
      .from(T.submissionAttachments)
      .select("id", { count: "exact", head: true })
      .eq("submission_id", input.submissionId);
    if ((count ?? 0) >= MAX_ATTACHMENTS) {
      return { ok: false, error: `Maximum ${MAX_ATTACHMENTS} attachments per application` };
    }
    if (input.sizeBytes <= 0 || input.sizeBytes > MAX_ATTACHMENT_BYTES) {
      return { ok: false, error: "File must be 5MB or smaller" };
    }
    if (!ALLOWED_ATTACHMENT_TYPES.includes(input.mimeType)) {
      return { ok: false, error: "Only images, PDF or DOCX files are allowed" };
    }

    const { data, error } = await supabase
      .from(T.submissionAttachments)
      .insert({
        org_id: ORG_ID,
        submission_id: input.submissionId,
        file_path: input.filePath,
        file_name: input.fileName,
        mime_type: input.mimeType,
        size_bytes: input.sizeBytes,
      })
      .select()
      .single();
    if (error) return { ok: false, error: friendly(error.message) };

    await writeAudit(supabase, {
      entity: "submission_attachments",
      entityId: data.id,
      action: "create",
      actor,
      diff: { submission_id: input.submissionId, file_name: input.fileName },
    });
    revalidateAll();
    return { ok: true, data: { id: data.id as string } };
  } catch (e) {
    return { ok: false, error: message(e) };
  }
}

/** Swaps an attachment's file in place — same row/id, new content — so it
 *  reads to staff as "editing" the attachment rather than delete-then-add. */
export async function replaceSubmissionAttachment(input: {
  id: string;
  filePath: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
}): Promise<ActionResult<null>> {
  try {
    const { supabase, actor } = await requirePermission("submissions", "update");

    if (input.sizeBytes <= 0 || input.sizeBytes > MAX_ATTACHMENT_BYTES) {
      return { ok: false, error: "File must be 5MB or smaller" };
    }
    if (!ALLOWED_ATTACHMENT_TYPES.includes(input.mimeType)) {
      return { ok: false, error: "Only images, PDF or DOCX files are allowed" };
    }

    const { data: before } = await supabase
      .from(T.submissionAttachments)
      .select("*")
      .eq("id", input.id)
      .single();
    if (!before) return { ok: false, error: "Attachment not found" };

    const { error } = await supabase
      .from(T.submissionAttachments)
      .update({
        file_path: input.filePath,
        file_name: input.fileName,
        mime_type: input.mimeType,
        size_bytes: input.sizeBytes,
      })
      .eq("id", input.id);
    if (error) return { ok: false, error: friendly(error.message) };

    // Removing the old file is a delete, and Storage has no per-module
    // policy of its own — so only do it for someone who has Submissions:
    // Delete. Without it the old object is left behind, orphaned but
    // harmless (the row no longer points at it), rather than a role that
    // can edit-but-not-delete quietly deleting a file by "replacing" it.
    if (await canAccess("submissions", "delete")) {
      await supabase.storage.from(ATTACHMENTS_BUCKET).remove([before.file_path]);
    }

    await writeAudit(supabase, {
      entity: "submission_attachments",
      entityId: input.id,
      action: "update",
      actor,
      diff: buildDiff(before, { ...before, file_name: input.fileName, file_path: input.filePath }),
    });
    revalidateAll();
    return { ok: true, data: null };
  } catch (e) {
    return { ok: false, error: message(e) };
  }
}

export async function deleteSubmissionAttachment(id: string): Promise<ActionResult<null>> {
  try {
    const { supabase, actor } = await requirePermission("submissions", "delete");

    const { data: attachment } = await supabase
      .from(T.submissionAttachments)
      .select("*")
      .eq("id", id)
      .single();
    if (!attachment) return { ok: false, error: "Attachment not found" };

    // Only remove the file once the row is confirmed gone — a blocked delete
    // reports no error, and the Storage bucket itself will happily delete for
    // any signed-in user, so this ordering is what keeps the two in step.
    const { data: removed, error } = await supabase
      .from(T.submissionAttachments)
      .delete()
      .eq("id", id)
      .select("id");
    if (error) return { ok: false, error: friendly(error.message) };
    if (!removed?.length) return { ok: false, error: NOTHING_DELETED };

    await supabase.storage.from(ATTACHMENTS_BUCKET).remove([attachment.file_path]);

    await writeAudit(supabase, {
      entity: "submission_attachments",
      entityId: id,
      action: "delete",
      actor,
      diff: buildDiff(attachment, null),
    });
    revalidateAll();
    return { ok: true, data: null };
  } catch (e) {
    return { ok: false, error: message(e) };
  }
}

/** Shared by Reject and Doubtful — identical shape, neither creates or
 *  touches any other table, so there's nothing to guard beyond "not already
 *  Approved" (moving away from Approved isn't supported — see submissions.ts
 *  module notes / the conversation that designed this). */
async function setReviewStatus(
  id: string,
  status: Extract<SubmissionStatus, "rejected" | "doubtful">,
  note: string,
): Promise<ActionResult<null>> {
  const trimmedNote = note.trim();
  if (!trimmedNote) return { ok: false, error: "A note is required" };

  try {
    const { supabase, actor } = await requirePermission("submissions", "update");

    const { data: before, error: beforeError } = await supabase
      .from(T.publicSubmissions)
      .select("status")
      .eq("id", id)
      .eq("org_id", ORG_ID)
      .single();
    if (beforeError || !before) return { ok: false, error: "Submission not found" };
    if (before.status === "approved") {
      return { ok: false, error: "Already approved — edit it instead of changing its status" };
    }

    const { error } = await supabase
      .from(T.publicSubmissions)
      .update({
        status,
        reviewed_by: actor,
        reviewed_at: new Date().toISOString(),
        review_note: trimmedNote,
      })
      .eq("id", id)
      .eq("org_id", ORG_ID)
      .neq("status", "approved");
    if (error) return { ok: false, error: friendly(error.message) };

    await writeAudit(supabase, {
      entity: "public_submissions",
      entityId: id,
      action: "update",
      actor,
      diff: { status: { from: before.status, to: status }, note: trimmedNote },
    });

    revalidateAll();
    return { ok: true, data: null };
  } catch (e) {
    return { ok: false, error: message(e) };
  }
}

export async function rejectSubmission(id: string, note: string): Promise<ActionResult<null>> {
  return setReviewStatus(id, "rejected", note);
}

/** Processed, but staff aren't confident about this student — a resolution
 *  distinct from Rejected (which says "no") and Pending (which says "not
 *  looked at yet"). */
export async function markSubmissionDoubtful(id: string, note: string): Promise<ActionResult<null>> {
  return setReviewStatus(id, "doubtful", note);
}

/** Every approve/reject/doubtful/edit against this submission, newest
 *  first — powers the History section in the review sheet. Reuses the
 *  general audit log rather than a dedicated table. */
export async function getSubmissionHistory(id: string): Promise<ActionResult<AuditLog[]>> {
  try {
    await requirePermission("submissions", "read");
    // The audit log is admin-only at the database level, so a reviewer would
    // always see an empty History through their own client. This reads it
    // elevated, but only ever the entries for this one submission.
    const admin = createAdminClient();
    const { data, error } = await admin
      .from(T.auditLogs)
      .select("*")
      .eq("org_id", ORG_ID)
      .eq("entity_name", "public_submissions")
      .eq("entity_id", id)
      .order("created_at", { ascending: false });
    if (error) return { ok: false, error: friendly(error.message) };
    return { ok: true, data: (data ?? []) as AuditLog[] };
  } catch (e) {
    return { ok: false, error: message(e) };
  }
}
