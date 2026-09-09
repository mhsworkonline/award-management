import JSZip from "jszip";
import { requireAdmin } from "@/lib/supabase/server";
import { ORG_ID } from "@/lib/constants";
import { ATTACHMENTS_BUCKET, STUDENT_PHOTOS_BUCKET } from "@/lib/tables";
import { BACKUP_TABLES } from "@/lib/backup/tables";

export const maxDuration = 180;

const INSERT_CHUNK_SIZE = 500;

/** Restores a ZIP produced by /api/backup/full-backup into this exact
 *  database. Guarded: refuses to run unless every table it would write to
 *  is already empty, so this can only ever populate a fresh install, never
 *  overwrite or duplicate into a live one. There is no "restore over
 *  existing data" mode — if that's ever needed, the safe path is to wipe
 *  the target first (a fresh Supabase project, or truncate everything)
 *  and run this against that.
 *
 *  Known, accepted limitations (agreed before this was built, not
 *  discovered after):
 *  - Staff logins aren't restored — am_profiles is tied to auth.users,
 *    whose passwords can't be exported at all. Recreate accounts
 *    afterward via Settings > Users & Roles.
 *  - am_persons isn't restored directly — inserting am_students
 *    regenerates it via the existing am_students_sync_person trigger
 *    (see migration 0021), which unconditionally creates a fresh
 *    am_persons row and overwrites person_id on every insert regardless
 *    of what's in the payload.
 *  - Assumes the target database is on the same migration/schema state as
 *    when the backup was taken. This does not attempt schema versioning
 *    or migration reconciliation. */
export async function POST(request: Request) {
  try {
    const { supabase } = await requireAdmin();

    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof Blob)) {
      return Response.json({ error: "No backup file was uploaded." }, { status: 400 });
    }

    // Guard: every table this restore would write to must already be
    // empty. One row anywhere is enough to refuse the whole operation —
    // this is meant for a fresh install, not a merge.
    const nonEmpty: string[] = [];
    for (const { table, filterColumn } of BACKUP_TABLES) {
      let query = supabase.from(table).select("*", { count: "exact", head: true });
      if (filterColumn) query = query.eq(filterColumn, ORG_ID);
      const { count, error } = await query;
      if (error) {
        return Response.json({ error: `Could not check ${table}: ${error.message}` }, { status: 500 });
      }
      if ((count ?? 0) > 0) nonEmpty.push(table);
    }
    if (nonEmpty.length > 0) {
      return Response.json(
        {
          error:
            "Restore refused: this database already has data in " +
            `${nonEmpty.join(", ")}. Restore only runs against a completely empty install.`,
        },
        { status: 409 },
      );
    }

    const buffer = await file.arrayBuffer();
    const zip = await JSZip.loadAsync(buffer);

    const manifestEntry = zip.file("manifest.json");
    if (!manifestEntry) {
      return Response.json(
        { error: "This doesn't look like a full backup — manifest.json is missing." },
        { status: 400 },
      );
    }

    const rowsRestored: Record<string, number> = {};
    for (const { table } of BACKUP_TABLES) {
      const entry = zip.file(`data/${table}.json`);
      if (!entry) continue;
      const rows = JSON.parse(await entry.async("string"));
      if (!Array.isArray(rows) || rows.length === 0) {
        rowsRestored[table] = 0;
        continue;
      }
      for (let i = 0; i < rows.length; i += INSERT_CHUNK_SIZE) {
        const chunk = rows.slice(i, i + INSERT_CHUNK_SIZE);
        const { error } = await supabase.from(table).insert(chunk);
        if (error) {
          return Response.json(
            {
              error: `Failed restoring ${table} (rows ${i}-${i + chunk.length}): ${error.message}. ` +
                "The database is now partially restored — the safest next step is to reset it to " +
                "empty (e.g. re-run migrations against a fresh project) before trying again.",
              rowsRestoredSoFar: rowsRestored,
            },
            { status: 500 },
          );
        }
      }
      rowsRestored[table] = rows.length;
    }

    let filesRestored = 0;
    const uploads: { path: string; bucket: string }[] = [];
    zip.folder("files/attachments")?.forEach((relativePath, entry) => {
      if (!entry.dir) uploads.push({ path: relativePath, bucket: ATTACHMENTS_BUCKET });
    });
    zip.folder("files/student-photos")?.forEach((relativePath, entry) => {
      if (!entry.dir) uploads.push({ path: relativePath, bucket: STUDENT_PHOTOS_BUCKET });
    });

    for (const { path, bucket } of uploads) {
      const prefix = bucket === ATTACHMENTS_BUCKET ? "files/attachments/" : "files/student-photos/";
      const entry = zip.file(`${prefix}${path}`);
      if (!entry) continue;
      const content = await entry.async("uint8array");
      const { error } = await supabase.storage.from(bucket).upload(path, content, { upsert: false });
      if (error) {
        return Response.json(
          {
            error: `Restored all table data, but failed uploading file "${path}" to ${bucket}: ${error.message}`,
            rowsRestored,
            filesRestoredSoFar: filesRestored,
          },
          { status: 500 },
        );
      }
      filesRestored++;
    }

    return Response.json({ ok: true, rowsRestored, filesRestored });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Restore failed";
    return Response.json(
      { error: msg },
      { status: msg === "Not authenticated" ? 401 : msg === "Administrator access required" ? 403 : 500 },
    );
  }
}
