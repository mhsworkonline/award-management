"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/supabase/server";
import { ORG_ID } from "@/lib/constants";
import { writeAudit } from "@/lib/audit";
import { friendly, message } from "@/lib/actions/crud";
import { T } from "@/lib/tables";
import type { ActionResult } from "@/lib/types";
import type { InstitutionImportType } from "@/lib/excel/institutions-workbook";

/** Commits a validated bulk import of schools or colleges. Rows the operator
 *  unchecked (including ones flagged as likely duplicates) never arrive
 *  here. Inserted one at a time rather than in a batch — am_institutions has
 *  a unique (org_id, name) constraint, so a row that collides (someone force-
 *  selected a flagged duplicate, or two operators imported concurrently) is
 *  simply skipped rather than failing the whole batch. */
export async function commitInstitutionImport(input: {
  type: InstitutionImportType;
  rows: {
    name: string;
    board_id: string | null;
    medium_id: string | null;
    city: string | null;
    contact_person: string | null;
    contact_no: string | null;
  }[];
}): Promise<ActionResult<{ inserted: number; skipped: number }>> {
  if (!input.rows.length) return { ok: false, error: "No rows selected for import" };

  try {
    const { supabase, actor } = await requireUser();

    let inserted = 0;
    let skipped = 0;

    for (const row of input.rows) {
      const { error } = await supabase.from(T.institutions).insert({
        org_id: ORG_ID,
        name: row.name,
        type: input.type,
        board_id: input.type === "school" ? row.board_id : null,
        medium_id: input.type === "school" ? row.medium_id : null,
        city: row.city,
        contact_person: row.contact_person,
        contact_no: row.contact_no,
      });

      if (error) {
        if (error.message.includes("duplicate key")) {
          skipped += 1;
          continue;
        }
        return {
          ok: false,
          error: `${friendly(error.message)} (stopped after ${inserted} inserted, ${skipped} skipped)`,
        };
      }
      inserted += 1;
    }

    await writeAudit(supabase, {
      entity: "institutions",
      entityId: null,
      action: "create",
      actor,
      diff: { bulk_import: { type: input.type, inserted, skipped } },
    });

    revalidatePath("/institutions");
    revalidatePath("/students");
    revalidatePath("/dashboard");
    return { ok: true, data: { inserted, skipped } };
  } catch (e) {
    return { ok: false, error: message(e) };
  }
}
