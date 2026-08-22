"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/supabase/server";
import { ORG_ID } from "@/lib/constants";
import { T } from "@/lib/tables";
import { buildDiff, writeAudit } from "@/lib/audit";
import { friendly, message } from "@/lib/actions/crud";
import { roleNameSchema, permissionGridSchema } from "@/lib/validators";
import { MODULES } from "@/lib/types";
import type { ActionResult, RoleWithPermissions } from "@/lib/types";

/** Every role/user-management action starts with requireAdmin() — RLS enforces
 *  the same thing on am_roles/am_permissions/am_profiles, this just gives a
 *  clean error message instead of a raw Postgres RLS failure. */

export async function listRolesWithPermissions(): Promise<RoleWithPermissions[]> {
  const { supabase } = await requireAdmin();
  const { data: roles } = await supabase.from(T.roles).select("*").order("created_at");
  const { data: perms } = await supabase.from(T.permissions).select("*");

  return (roles ?? []).map((role) => {
    const own = (perms ?? []).filter((p) => p.role_id === role.id);
    const permissions = MODULES.map((m) => {
      const row = own.find((p) => p.module === m.value);
      return {
        module: m.value,
        can_create: row?.can_create ?? false,
        can_read: row?.can_read ?? false,
        can_update: row?.can_update ?? false,
        can_delete: row?.can_delete ?? false,
      };
    });
    return { ...role, permissions };
  });
}

export async function createRole(raw: unknown): Promise<ActionResult<{ id: string }>> {
  const parsed = roleNameSchema.omit({ id: true }).safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: "Enter a role name", fieldErrors: parsed.error.flatten().fieldErrors };
  }

  try {
    const { supabase, actor } = await requireAdmin();

    const { data, error } = await supabase
      .from(T.roles)
      .insert({ ...parsed.data, org_id: ORG_ID })
      .select()
      .single();
    if (error) return { ok: false, error: friendly(error.message) };

    // New role starts with every module unchecked — least-privilege default.
    await supabase.from(T.permissions).insert(
      MODULES.map((m) => ({
        role_id: data.id,
        module: m.value,
        can_create: false,
        can_read: false,
        can_update: false,
        can_delete: false,
      })),
    );

    await writeAudit(supabase, { entity: "roles", entityId: data.id, action: "create", actor, diff: buildDiff(null, data) });
    revalidatePath("/settings");
    return { ok: true, data: { id: data.id as string } };
  } catch (e) {
    return { ok: false, error: message(e) };
  }
}

export async function renameRole(raw: unknown): Promise<ActionResult<null>> {
  const parsed = roleNameSchema.safeParse(raw);
  if (!parsed.success || !parsed.data.id) {
    return { ok: false, error: "Enter a role name", fieldErrors: parsed.success ? undefined : parsed.error.flatten().fieldErrors };
  }

  try {
    const { supabase, actor } = await requireAdmin();
    const { data: before } = await supabase.from(T.roles).select("*").eq("id", parsed.data.id).single();

    const { data, error } = await supabase
      .from(T.roles)
      .update({ name: parsed.data.name })
      .eq("id", parsed.data.id)
      .eq("org_id", ORG_ID)
      .select()
      .single();
    if (error) return { ok: false, error: friendly(error.message) };

    await writeAudit(supabase, {
      entity: "roles",
      entityId: parsed.data.id,
      action: "update",
      actor,
      diff: buildDiff(before ?? null, data),
    });
    revalidatePath("/settings");
    return { ok: true, data: null };
  } catch (e) {
    return { ok: false, error: message(e) };
  }
}

/** Saves the whole grid for one role in a single upsert — the UI always sends
 *  all ten module rows (see permissionGridSchema), so this replaces the set
 *  wholesale rather than diffing individual checkboxes. */
export async function saveRolePermissions(raw: unknown): Promise<ActionResult<null>> {
  const parsed = permissionGridSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "Invalid permission grid" };

  try {
    const { supabase, actor } = await requireAdmin();

    const { error } = await supabase
      .from(T.permissions)
      .upsert(
        parsed.data.permissions.map((p) => ({ ...p, role_id: parsed.data.role_id })),
        { onConflict: "role_id,module" },
      );
    if (error) return { ok: false, error: friendly(error.message) };

    await writeAudit(supabase, {
      entity: "permissions",
      entityId: parsed.data.role_id,
      action: "update",
      actor,
      diff: { permissions: parsed.data.permissions },
    });
    revalidatePath("/settings");
    return { ok: true, data: null };
  } catch (e) {
    return { ok: false, error: message(e) };
  }
}

export async function deleteRole(id: string): Promise<ActionResult<null>> {
  try {
    const { supabase, actor } = await requireAdmin();
    const { data: before } = await supabase.from(T.roles).select("*").eq("id", id).single();

    const { error } = await supabase.from(T.roles).delete().eq("id", id).eq("org_id", ORG_ID);
    if (error) {
      if (error.message.includes("violates foreign key")) {
        return { ok: false, error: "Reassign every user on this role before deleting it" };
      }
      return { ok: false, error: friendly(error.message) };
    }

    await writeAudit(supabase, { entity: "roles", entityId: id, action: "delete", actor, diff: buildDiff(before ?? null, null) });
    revalidatePath("/settings");
    return { ok: true, data: null };
  } catch (e) {
    return { ok: false, error: message(e) };
  }
}
