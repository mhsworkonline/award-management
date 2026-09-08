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

/** Fields a bulk edit can set across every selected institution in one
 *  update — a key's absence means "leave this field alone" on every row,
 *  never "clear it". Name is deliberately not here: bulk-editing it would
 *  mean giving several different institutions the same name, which is
 *  never what's wanted (and am_institutions enforces unique names anyway). */
export type InstitutionBulkPatch = {
  type?: "school" | "college";
  board_id?: string | null;
  medium_id?: string | null;
  city?: string | null;
  contact_person?: string | null;
  contact_no?: string | null;
};

/** Applies the same patch to every institution in `ids` in one statement —
 *  "change a value on one row, apply it to every selected row" from the
 *  Institutions list. Board/medium only make sense for schools; the caller
 *  (institutions-client.tsx) already splits a mixed selection into a
 *  school-ids call (patch includes board/medium) and a non-school-ids call
 *  (patch without them) whenever type itself isn't also being bulk-set —
 *  this action stays a plain, generic "update these rows" primitive and
 *  isn't responsible for that split. If `type` is being set to "college",
 *  board_id/medium_id are forced to null regardless of what's in the
 *  patch — same invariant the single-institution edit form already
 *  enforces (colleges never carry a board or medium). */
export async function bulkUpdateInstitutions(
  ids: string[],
  patch: InstitutionBulkPatch,
): Promise<ActionResult<{ updated: number }>> {
  if (ids.length === 0) return { ok: false, error: "No institutions selected" };
  if (Object.keys(patch).length === 0) return { ok: false, error: "Fill in at least one field to apply" };

  try {
    const { supabase, actor } = await requireUser();

    const values: Record<string, unknown> = { ...patch };
    if (values.type === "college") {
      values.board_id = null;
      values.medium_id = null;
    }

    const { data, error } = await supabase
      .from(T.institutions)
      .update(values)
      .eq("org_id", ORG_ID)
      .in("id", ids)
      .select("id");

    if (error) return { ok: false, error: friendly(error.message) };

    await writeAudit(supabase, {
      entity: "institutions",
      entityId: null,
      action: "update",
      actor,
      diff: { bulk_edit: { ids, patch: values } },
    });

    revalidatePath("/institutions");
    revalidatePath("/students");
    revalidatePath("/dashboard");
    return { ok: true, data: { updated: data?.length ?? ids.length } };
  } catch (e) {
    return { ok: false, error: message(e) };
  }
}
