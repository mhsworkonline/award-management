import JSZip from "jszip";
import { requireUser } from "@/lib/supabase/server";
import { ORG_ID } from "@/lib/constants";
import { ATTACHMENTS_BUCKET, STUDENT_PHOTOS_BUCKET, T } from "@/lib/tables";
import { normalizeName } from "@/lib/utils";

export const maxDuration = 120;

/** Bundles every marksheet attachment and student photo into one ZIP —
 *  the self-contained alternative to a Google Drive integration (see
 *  commit history: a service account can't write into a personal Drive at
 *  all, and full OAuth turned into enough Google Cloud Console friction
 *  that a plain download-then-you-drag-it-into-Drive-yourself won on
 *  simplicity). No external API, no credentials, nothing to keep working
 *  over time — the tradeoff is this can't record Drive links back into the
 *  database the way a real API integration could have.
 *
 *  Photos are deduped by storage path: an approved student's photo_path is
 *  copied from their originating submission (see approveSubmission), so
 *  without this a backup would otherwise contain the same photo twice. */
export async function GET() {
  try {
    const { supabase } = await requireUser();

    const [attachments, submissionPhotos, studentPhotos] = await Promise.all([
      supabase
        .from(T.submissionAttachments)
        .select("file_path, file_name")
        .eq("org_id", ORG_ID),
      supabase
        .from(T.publicSubmissions)
        .select("photo_path, first_name, last_name, reference_code")
        .eq("org_id", ORG_ID)
        .not("photo_path", "is", null),
      supabase
        .from(T.students)
        .select("photo_path, first_name, last_name")
        .eq("org_id", ORG_ID)
        .not("photo_path", "is", null),
    ]);

    const zip = new JSZip();
    const marksheets = zip.folder("marksheets");
    const photos = zip.folder("student-photos");

    let fileCount = 0;

    for (const a of attachments.data ?? []) {
      const { data } = await supabase.storage.from(ATTACHMENTS_BUCKET).download(a.file_path);
      if (!data) continue;
      // Two submissions can both attach a file literally named "marksheet.pdf" —
      // prefix with the storage path's own folder (the submission id) so
      // nothing silently overwrites another file of the same name.
      const prefix = a.file_path.split("/")[0]?.slice(0, 8) ?? "file";
      marksheets?.file(`${prefix}-${a.file_name}`, await data.arrayBuffer());
      fileCount++;
    }

    // Dedupe by storage path — see the module doc comment above.
    const photoByPath = new Map<string, { label: string }>();
    for (const s of submissionPhotos.data ?? []) {
      if (!s.photo_path) continue;
      const label = `${s.first_name}-${s.last_name}-${s.reference_code}`;
      photoByPath.set(s.photo_path, { label: normalizeName(label).replace(/\s+/g, "-") });
    }
    for (const s of studentPhotos.data ?? []) {
      if (!s.photo_path || photoByPath.has(s.photo_path)) continue;
      const label = `${s.first_name}-${s.last_name}`;
      photoByPath.set(s.photo_path, { label: normalizeName(label).replace(/\s+/g, "-") });
    }

    for (const [path, { label }] of photoByPath) {
      const { data } = await supabase.storage.from(STUDENT_PHOTOS_BUCKET).download(path);
      if (!data) continue;
      const ext = path.split(".").pop() || "jpg";
      photos?.file(`${label || path.split("/").pop()}.${ext}`, await data.arrayBuffer());
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
