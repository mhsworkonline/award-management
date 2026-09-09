import JSZip from "jszip";
import { requireUser } from "@/lib/supabase/server";
import { ORG_ID } from "@/lib/constants";
import { ATTACHMENTS_BUCKET, STUDENT_PHOTOS_BUCKET, T } from "@/lib/tables";

export const maxDuration = 120;

/** Bundles every marksheet attachment and student photo into one ZIP —
 *  the self-contained alternative to a Google Drive integration (see
 *  commit history: a service account can't write into a personal Drive at
 *  all, and full OAuth turned into enough Google Cloud Console friction
 *  that a plain download-then-you-drag-it-into-Drive-yourself won on
 *  simplicity).
 *
 *  Every file is prefixed with the applicant's reference code (e.g.
 *  "S25-4") — the same unique per-applicant code shown on the public
 *  form's confirmation screen and in the Submissions list — so a
 *  marksheet and a photo for the same person share a recognizable prefix,
 *  and nothing in the ZIP is an anonymous file you can't trace back.
 *  Students added directly by staff (never went through a public
 *  submission, so they have no reference code) get an "ADMIN-<id>"
 *  prefix instead — clearly a different case, not a missing one.
 *
 *  Photos are deduped by storage path: an approved student's photo_path is
 *  copied from their originating submission (see approveSubmission), so
 *  without this a backup would otherwise contain the same photo twice. */
export async function GET() {
  try {
    const { supabase } = await requireUser();

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
    // A student approved from a submission can be traced back to their
    // reference code this way even though am_students itself has no such
    // column — student_id is only populated on the submission once approved.
    const refCodeByStudentId = new Map(
      (submissions.data ?? [])
        .filter((s) => s.student_id)
        .map((s) => [s.student_id as string, s.reference_code]),
    );

    const zip = new JSZip();
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

    // Dedupe by storage path — see the module doc comment above.
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

    if (fileCount === 0) {
      return new Response("No files to back up yet.", { status: 404 });
    }

    const buffer = await zip.generateAsync({ type: "arraybuffer", compression: "DEFLATE" });
    const stamp = new Date().toISOString().slice(0, 10);

    return new Response(buffer, {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="award-management-files-${stamp}.zip"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Backup failed";
    return new Response(msg, { status: msg === "Not authenticated" ? 401 : 500 });
  }
}
