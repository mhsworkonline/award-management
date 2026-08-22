import { revalidatePath } from "next/cache";
import type { ZodTypeAny } from "zod";
import { requireUser } from "@/lib/supabase/server";
import { ORG_ID } from "@/lib/constants";
import { buildDiff, writeAudit } from "@/lib/audit";
import type { ActionResult } from "@/lib/types";

/** Shared save/delete path for the eight config entities. Each one differs only
 *  by table, schema and the paths to revalidate — so the pipeline (auth → validate
 *  → write → audit → revalidate) lives here exactly once. */
export async function saveEntity<S extends ZodTypeAny>(config: {
  /** Physical table name (prefixed). */
  table: string;
  /** Logical name recorded in the audit trail. */
  entity: string;
  schema: S;
  raw: unknown;
  revalidate?: string[];
}): Promise<ActionResult<{ id: string }>> {
  const parsed = config.schema.safeParse(config.raw);
  if (!parsed.success) {
    const flat = parsed.error.flatten();
    return {
      ok: false,
      error: "Please correct the highlighted fields",
      fieldErrors: flat.fieldErrors as Record<string, string[]>,
    };
  }

  const { id, ...values } = parsed.data as { id?: string } & Record<string, unknown>;

  try {
    const { supabase, actor } = await requireUser();

    if (id) {
      const { data: before } = await supabase.from(config.table).select("*").eq("id", id).single();

      const { data, error } = await supabase
        .from(config.table)
        .update(values)
        .eq("id", id)
        .eq("org_id", ORG_ID)
        .select()
        .single();

      if (error) return { ok: false, error: friendly(error.message) };

      await writeAudit(supabase, {
        entity: config.entity,
        entityId: id,
        action: "update",
        actor,
        diff: buildDiff(before ?? null, data),
      });
      revalidateAll(config.revalidate);
      return { ok: true, data: { id } };
    }

    const { data, error } = await supabase
      .from(config.table)
      .insert({ ...values, org_id: ORG_ID })
      .select()
      .single();

    if (error) return { ok: false, error: friendly(error.message) };

    await writeAudit(supabase, {
      entity: config.table,
      entityId: data.id,
      action: "create",
      actor,
      diff: buildDiff(null, data),
    });
    revalidateAll(config.revalidate);
    return { ok: true, data: { id: data.id as string } };
  } catch (e) {
    return { ok: false, error: message(e) };
  }
}

export async function deleteEntity(config: {
  table: string;
  entity: string;
  id: string;
  revalidate?: string[];
}): Promise<ActionResult<null>> {
  try {
    const { supabase, actor } = await requireUser();

    const { data: before } = await supabase
      .from(config.table)
      .select("*")
      .eq("id", config.id)
      .single();

    const { error } = await supabase
      .from(config.table)
      .delete()
      .eq("id", config.id)
      .eq("org_id", ORG_ID);

    if (error) return { ok: false, error: friendly(error.message) };

    await writeAudit(supabase, {
      entity: config.table,
      entityId: config.id,
      action: "delete",
      actor,
      diff: buildDiff(before ?? null, null),
    });
    revalidateAll(config.revalidate);
    return { ok: true, data: null };
  } catch (e) {
    return { ok: false, error: message(e) };
  }
}

function revalidateAll(paths?: string[]) {
  for (const p of paths ?? []) revalidatePath(p);
}

export function message(e: unknown) {
  return e instanceof Error ? e.message : "Something went wrong";
}

/** Postgres errors are precise but unfriendly — translate the common ones. */
export function friendly(raw: string) {
  if (raw.includes("duplicate key")) return "A record with these details already exists";
  if (raw.includes("violates foreign key")) {
    return "This record is still referenced elsewhere and cannot be removed";
  }
  if (raw.includes("am_students_placement_ck")) {
    return "Select a standard (school) or a course (college)";
  }
  if (raw.includes("Insufficient stock")) {
    return raw.slice(raw.indexOf("Insufficient stock"));
  }
  if (raw.includes("row-level security policy") || raw.includes("row-level security")) {
    return "Your role doesn't have permission to do that. Ask an administrator if you need access.";
  }
  return raw;
}
