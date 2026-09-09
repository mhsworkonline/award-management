import JSZip from "jszip";
import { requireAdmin } from "@/lib/supabase/server";
import { ORG_ID } from "@/lib/constants";
import { BACKUP_TABLES } from "@/lib/backup/tables";
import { addRestorableFilesToZip } from "@/lib/backup/files";

export const maxDuration = 180;

const BACKUP_FORMAT_VERSION = 1;

/** Everything: every table this app owns as JSON, plus the same
 *  marksheets/student-photos files the plain files-only ZIP has — one
 *  archive that, together with the restore route, can rebuild a fresh
 *  install from nothing.
 *
 *  JSON, not a spreadsheet: a restore needs exact types, nulls and
 *  relational structure back, and CSV/XLS don't round-trip that reliably
 *  (an empty string and a null look identical, a UUID and a phone number
 *  both look like "text", etc). One file per table under data/, so the
 *  archive is inspectable without any special tooling if you just want to
 *  look at what's in it.
 *
 *  Deliberately admin-only (unlike the files-only ZIP) — this is a full
 *  copy of every applicant's personal data, not just attachments already
 *  visible to any signed-in staff member elsewhere in the app. */
export async function GET() {
  try {
    const { supabase } = await requireAdmin();

    const zip = new JSZip();
    const data = zip.folder("data");
    const rowCounts: Record<string, number> = {};

    for (const { table, filterColumn } of BACKUP_TABLES) {
      let query = supabase.from(table).select("*");
      if (filterColumn) query = query.eq(filterColumn, ORG_ID);
      const { data: rows, error } = await query;
      if (error) {
        return new Response(`Failed reading ${table}: ${error.message}`, { status: 500 });
      }
      rowCounts[table] = rows?.length ?? 0;
      data?.file(`${table}.json`, JSON.stringify(rows ?? [], null, 2));
    }

    const fileCount = await addRestorableFilesToZip(supabase, zip);

    zip.file(
      "manifest.json",
      JSON.stringify(
        {
          format_version: BACKUP_FORMAT_VERSION,
          exported_at: new Date().toISOString(),
          org_id: ORG_ID,
          tables: BACKUP_TABLES.map((t) => t.table),
          row_counts: rowCounts,
          file_count: fileCount,
          excluded_tables: {
            am_persons: "auto-derived from am_students by a database trigger — restored as a side effect of restoring students",
            am_profiles: "tied to auth.users; Supabase Auth passwords can't be exported. Recreate staff accounts after restore via Settings > Users & Roles.",
          },
        },
        null,
        2,
      ),
    );

    const buffer = await zip.generateAsync({ type: "arraybuffer", compression: "DEFLATE" });
    const stamp = new Date().toISOString().slice(0, 10);

    return new Response(buffer, {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="award-management-full-backup-${stamp}.zip"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Backup failed";
    return new Response(msg, {
      status: msg === "Not authenticated" ? 401 : msg === "Administrator access required" ? 403 : 500,
    });
  }
}
