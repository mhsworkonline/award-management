"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/supabase/server";
import { ORG_ID } from "@/lib/constants";
import { buildDiff, writeAudit } from "@/lib/audit";
import { friendly, message } from "@/lib/actions/crud";
import { submissionEditSchema } from "@/lib/validators";
import { normalizeName } from "@/lib/utils";
import { findDuplicateStudents } from "@/lib/data/students";
import { ATTACHMENTS_BUCKET, T } from "@/lib/tables";
import { ALLOWED_ATTACHMENT_TYPES, MAX_ATTACHMENTS, MAX_ATTACHMENT_BYTES } from "@/lib/attachments";
import type { ActionResult } from "@/lib/types";

function revalidateAll() {
  revalidatePath("/submissions");
  revalidatePath("/students");
  revalidatePath("/academic-records");
  revalidatePath("/dashboard");
}

/** Same possible-duplicate warning shown on the Add Student page, reused here
 *  so staff see it before approving a public submission too. */
export async function checkSubmissionDuplicates(input: {
  first_name: string;
  middle_name?: string | null;
  last_name: string;
}) {
  try {
    await requireUser();
    const rows = await findDuplicateStudents(input);
    return {
      ok: true as const,
      data: rows.map((r) => [r.first_name, r.middle_name, r.last_name].filter(Boolean).join(" ")),
    };
  } catch (e) {
    return { ok: false as const, error: message(e) };
  }
}

/** Edits a pending submission's fields without approving it yet. */
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
    const { supabase } = await requireUser();
    const { error } = await supabase
      .from(T.publicSubmissions)
      .update(values)
      .eq("id", id)
      .eq("org_id", ORG_ID)
      .eq("status", "pending");
    if (error) return { ok: false, error: friendly(error.message) };
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
export async function approveSubmission(id: string): Promise<ActionResult<{ studentId: string; recordId: string }>> {
  try {
    const { supabase, actor } = await requireUser();

    const { data: sub, error: subError } = await supabase
      .from(T.publicSubmissions)
      .select("*")
      .eq("id", id)
      .eq("org_id", ORG_ID)
      .eq("status", "pending")
      .single();
    if (subError || !sub) return { ok: false, error: "Submission not found or already reviewed" };

    if (!sub.institution_id) {
      return { ok: false, error: "Resolve the custom institution to a real one before approving" };
    }
    if (!sub.standard_id && !sub.course_id) {
      return { ok: false, error: "Resolve the custom course to a real one before approving" };
    }
    if (sub.standard_id && !sub.board_id) {
      return { ok: false, error: "Resolve the custom board to a real one before approving" };
    }
    if (sub.standard_id && !sub.medium_id) {
      return { ok: false, error: "Select a medium of instruction before approving" };
    }

    const existing = await supabase
      .from(T.students)
      .select("id, salutation, first_name, middle_name, last_name, email")
      .eq("org_id", ORG_ID)
      .limit(50000);

    const key = `${normalizeName(sub.first_name)}|${normalizeName(sub.middle_name)}|${normalizeName(sub.last_name)}`;
    const match = (existing.data ?? []).find(
      (s) => `${normalizeName(s.first_name)}|${normalizeName(s.middle_name)}|${normalizeName(s.last_name)}` === key,
    );

    let studentId = match?.id as string | undefined;

    if (studentId) {
      // Backfill fields the existing record never had — never overwrite ones it does.
      const backfill: Record<string, unknown> = {};
      if (!match?.email && sub.email) backfill.email = sub.email;
      if (!match?.salutation && sub.salutation) backfill.salutation = sub.salutation;
      if (Object.keys(backfill).length > 0) {
        await supabase.from(T.students).update(backfill).eq("id", studentId);
      }
    }

    if (!studentId) {
      const { data: newStudent, error: studentError } = await supabase
        .from(T.students)
        .insert({
          org_id: ORG_ID,
          salutation: sub.salutation,
          first_name: sub.first_name,
          middle_name: sub.middle_name,
          last_name: sub.last_name,
          email: sub.email,
          contact_no: sub.contact_no,
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

    const { data: record, error: recordError } = await supabase
      .from(T.academicRecords)
      .insert({
        org_id: ORG_ID,
        student_id: studentId,
        institution_id: sub.institution_id,
        academic_year_id: sub.academic_year_id,
        standard_id: sub.standard_id,
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
      })
      .eq("id", id);
    if (updateError) return { ok: false, error: friendly(updateError.message) };

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
    const { supabase } = await requireUser();
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
    const { supabase, actor } = await requireUser();

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
    const { supabase, actor } = await requireUser();

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

    // Best-effort — the DB row is already correct even if the old object
    // lingers in Storage (orphaned, but harmless and never referenced again).
    await supabase.storage.from(ATTACHMENTS_BUCKET).remove([before.file_path]);

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
    const { supabase, actor } = await requireUser();

    const { data: attachment } = await supabase
      .from(T.submissionAttachments)
      .select("*")
      .eq("id", id)
      .single();
    if (!attachment) return { ok: false, error: "Attachment not found" };

    const { error } = await supabase.from(T.submissionAttachments).delete().eq("id", id);
    if (error) return { ok: false, error: friendly(error.message) };

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

export async function rejectSubmission(id: string, reason?: string): Promise<ActionResult<null>> {
  try {
    const { supabase, actor } = await requireUser();
    const { error } = await supabase
      .from(T.publicSubmissions)
      .update({
        status: "rejected",
        reviewed_by: actor,
        reviewed_at: new Date().toISOString(),
        rejection_reason: reason || null,
      })
      .eq("id", id)
      .eq("org_id", ORG_ID)
      .eq("status", "pending");
    if (error) return { ok: false, error: friendly(error.message) };

    await writeAudit(supabase, {
      entity: "public_submissions",
      entityId: id,
      action: "update",
      actor,
      diff: { status: { to: "rejected" }, reason: reason ?? null },
    });

    revalidateAll();
    return { ok: true, data: null };
  } catch (e) {
    return { ok: false, error: message(e) };
  }
}
