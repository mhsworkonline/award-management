import JSZip from "jszip";
import { requireUser } from "@/lib/supabase/server";
import { addFilesToZip } from "@/lib/backup/files";

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
 *  The actual file-gathering logic lives in lib/backup/files.ts, shared
 *  with the full-backup route below — this one just wraps it as a
 *  standalone download. */
export async function GET() {
  try {
    const { supabase } = await requireUser();

    const zip = new JSZip();
    const fileCount = await addFilesToZip(supabase, zip);

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
