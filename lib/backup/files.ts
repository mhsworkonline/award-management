import type JSZip from "jszip";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ORG_ID } from "@/lib/constants";
import { ATTACHMENTS_BUCKET, STUDENT_PHOTOS_BUCKET, T } from "@/lib/tables";

/** Shared by both the files-only ZIP and the full backup — downloads every
 *  marksheet attachment and student photo and adds them to `zip` under
 *  marksheets/ and student-photos/, each prefixed with the applicant's
 *  reference code (see the traceability requirement this was built for).
 *  Returns how many files were added, so callers can tell an empty backup
 *  apart from a working one. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function addFilesToZip(supabase: SupabaseClient<any>, zip: JSZip): Promise<number> {
  const [submissions, attachments, students] = await Promise.all([
    supabase
      .from(T.publicSubmissions)
      .select("id, reference_code, first_name, last_name, student_id, photo_path")
      .eq("org_id", ORG_ID),
    supabase
      .from(T.submissionAttachments)
      .select("submission_id, file_path, file_name")
      .eq("org_id", ORG_ID),
    supabase
      .from(T.students)
      .select("id, first_name, last_name, photo_path")
      .eq("org_id", ORG_ID)
      .not("photo_path", "is", null),
  ]);

  const submissionById = new Map((submissions.data ?? []).map((s) => [s.id, s]));
  const refCodeByStudentId = new Map(
    (submissions.data ?? [])
      .filter((s) => s.student_id)
      .map((s) => [s.student_id as string, s.reference_code]),
  );

  const marksheets = zip.folder("marksheets");
  const photos = zip.folder("student-photos");
  let fileCount = 0;

  for (const a of attachments.data ?? []) {
    const { data } = await supabase.storage.from(ATTACHMENTS_BUCKET).download(a.file_path);
    if (!data) continue;
    const code = submissionById.get(a.submission_id)?.reference_code ?? "UNKNOWN";
    marksheets?.file(`${code}-${a.file_name}`, await data.arrayBuffer());
    fileCount++;
  }

  const photoByPath = new Map<string, { label: string }>();
  for (const s of submissions.data ?? []) {
    if (!s.photo_path) continue;
    photoByPath.set(s.photo_path, { label: `${s.reference_code}-${s.first_name}-${s.last_name}` });
  }
  for (const s of students.data ?? []) {
    if (!s.photo_path || photoByPath.has(s.photo_path)) continue;
    const code = refCodeByStudentId.get(s.id) ?? `ADMIN-${s.id.slice(0, 8)}`;
    photoByPath.set(s.photo_path, { label: `${code}-${s.first_name}-${s.last_name}` });
  }

  for (const [path, { label }] of photoByPath) {
    const { data } = await supabase.storage.from(STUDENT_PHOTOS_BUCKET).download(path);
    if (!data) continue;
    const ext = path.split(".").pop() || "jpg";
    const safeLabel = label.replace(/[^a-zA-Z0-9-]+/g, "-");
    photos?.file(`${safeLabel}.${ext}`, await data.arrayBuffer());
    fileCount++;
  }

  return fileCount;
}

/** The full-backup counterpart to addFilesToZip above — same source files,
 *  but stored under their *exact original storage path* instead of a
 *  human-readable reference-code name, because restore needs to re-upload
 *  each one to precisely where the restored row's file_path/photo_path
 *  says it lives. (The renamed version is for a person browsing the ZIP;
 *  this one is for a machine reconstructing storage state, and the two
 *  needs pull in opposite directions on naming.) Dedupes student photos by
 *  path for the same reason as above — a student's photo_path is copied
 *  from their originating submission. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function addRestorableFilesToZip(supabase: SupabaseClient<any>, zip: JSZip): Promise<number> {
  const [attachments, submissions, students] = await Promise.all([
    supabase.from(T.submissionAttachments).select("file_path").eq("org_id", ORG_ID),
    supabase.from(T.publicSubmissions).select("photo_path").eq("org_id", ORG_ID).not("photo_path", "is", null),
    supabase.from(T.students).select("photo_path").eq("org_id", ORG_ID).not("photo_path", "is", null),
  ]);

  const attachmentsFolder = zip.folder("files")?.folder("attachments");
  const photosFolder = zip.folder("files")?.folder("student-photos");
  let fileCount = 0;

  const attachmentPaths = new Set((attachments.data ?? []).map((a) => a.file_path));
  for (const path of attachmentPaths) {
    const { data } = await supabase.storage.from(ATTACHMENTS_BUCKET).download(path);
    if (!data) continue;
    attachmentsFolder?.file(path, await data.arrayBuffer());
    fileCount++;
  }

  const photoPaths = new Set<string>();
  for (const s of submissions.data ?? []) if (s.photo_path) photoPaths.add(s.photo_path);
  for (const s of students.data ?? []) if (s.photo_path) photoPaths.add(s.photo_path);
  for (const path of photoPaths) {
    const { data } = await supabase.storage.from(STUDENT_PHOTOS_BUCKET).download(path);
    if (!data) continue;
    photosFolder?.file(path, await data.arrayBuffer());
    fileCount++;
  }

  return fileCount;
}
