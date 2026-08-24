"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { T } from "@/lib/tables";
import { buildDiff, writeAudit } from "@/lib/audit";
import { friendly, message } from "@/lib/actions/crud";
import { createUserSchema, updateUserRoleSchema } from "@/lib/validators";
import type { ActionResult, UserRow } from "@/lib/types";

/** Only rows this app actually provisioned — auth.users (and so am_profiles,
 *  via the auto-create trigger) is shared with every other app on this
 *  Supabase project, so most rows here belong to accounts that have nothing
 *  to do with Award Management. See 0027_profile_provisioned_flag.sql. */
export async function listUsers(): Promise<UserRow[]> {
  const { supabase } = await requireAdmin();
  const { data } = await supabase
    .from(T.profiles)
    .select("*, roles:am_roles(id, name)")
    .eq("provisioned", true)
    .order("created_at");
  return (data as UserRow[] | null) ?? [];
}

/** Creates the auth.users row (via the Admin API, service-role only) with the
 *  given temp password, then assigns the role — the bare am_profiles row
 *  already exists by the time this runs (am_auth_users_create_profile fires
 *  on the auth.users insert), so this only ever needs to UPDATE it. */
export async function createUser(raw: unknown): Promise<ActionResult<{ id: string }>> {
  const parsed = createUserSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: "Please correct the highlighted fields", fieldErrors: parsed.error.flatten().fieldErrors };
  }

  try {
    const { supabase, actor } = await requireAdmin();
    const admin = createAdminClient();

    const { data: created, error: authError } = await admin.auth.admin.createUser({
      email: parsed.data.email,
      password: parsed.data.password,
      email_confirm: true,
    });
    if (authError || !created.user) {
      return { ok: false, error: authError?.message.includes("already been registered")
        ? "A user with this email already exists"
        : (authError?.message ?? "Could not create the account") };
    }

    const { data, error } = await supabase
      .from(T.profiles)
      .update({
        role_id: parsed.data.role_id,
        is_admin: parsed.data.is_admin,
        full_name: parsed.data.full_name,
        provisioned: true,
      })
      .eq("id", created.user.id)
      .select()
      .single();

    if (error) {
      // Auth account exists but the profile update failed — remove the
      // orphaned account rather than leaving an unusable, unmanaged login.
      await admin.auth.admin.deleteUser(created.user.id);
      return { ok: false, error: friendly(error.message) };
    }

    await writeAudit(supabase, {
      entity: "users",
      entityId: created.user.id,
      action: "create",
      actor,
      diff: buildDiff(null, data),
    });
    revalidatePath("/settings");
    return { ok: true, data: { id: created.user.id } };
  } catch (e) {
    return { ok: false, error: message(e) };
  }
}

export async function updateUserRole(raw: unknown): Promise<ActionResult<null>> {
  const parsed = updateUserRoleSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "Invalid request" };

  try {
    const { supabase, actor } = await requireAdmin();
    const { data: before } = await supabase.from(T.profiles).select("*").eq("id", parsed.data.id).single();

    const { data, error } = await supabase
      .from(T.profiles)
      .update({ role_id: parsed.data.role_id, is_admin: parsed.data.is_admin })
      .eq("id", parsed.data.id)
      .select()
      .single();
    if (error) return { ok: false, error: friendly(error.message) };

    await writeAudit(supabase, {
      entity: "users",
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

/** Removes module access and admin status without deleting the account —
 *  the simplest, safest "deactivate": the very next request this user makes
 *  is already governed (permissions are checked fresh, not cached in the
 *  session), so this takes effect immediately, not on their next login. */
export async function revokeUserAccess(id: string): Promise<ActionResult<null>> {
  try {
    const { supabase, actor, user } = await requireAdmin();
    if (id === user.id) return { ok: false, error: "You cannot revoke your own access" };

    const { data: before } = await supabase.from(T.profiles).select("*").eq("id", id).single();

    const { data, error } = await supabase
      .from(T.profiles)
      .update({ role_id: null, is_admin: false })
      .eq("id", id)
      .select()
      .single();
    if (error) return { ok: false, error: friendly(error.message) };

    await writeAudit(supabase, {
      entity: "users",
      entityId: id,
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
