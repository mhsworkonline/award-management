import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";
import { cache } from "react";
import { MODULES, type ModuleName, type ModulePermissions, type CrudAction } from "@/lib/types";

type CookiesToSet = { name: string; value: string; options: CookieOptions }[];

/** Request-scoped Supabase client. Session comes from the auth cookie, so RLS
 *  applies to everything read or written through it. */
export function createClient() {
  const cookieStore = cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet: CookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // Called from a Server Component render — middleware refreshes the session.
          }
        },
      },
    },
  );
}

/** Throws if there is no session. Every mutation and data read goes through this. */
export async function requireUser() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");
  return { supabase, user, actor: user.email ?? user.id };
}

/** The signed-in user's profile — role name resolved for display, is_admin
 *  for gating Users & Roles. Returns null if somehow unauthenticated; callers
 *  that need to enforce this use requireUser()/requireAdmin() instead. */
export async function getCurrentProfile() {
  const { supabase, user } = await requireUser();
  const { data } = await supabase
    .from("am_profiles")
    .select("*, roles:am_roles(id, name)")
    .eq("id", user.id)
    .single();
  return data;
}

/** Throws unless the signed-in user is an admin. Call at the top of every
 *  role/user-management server action — RLS enforces the same thing on the
 *  underlying tables, this just gives a clean error instead of a silent
 *  no-op or a raw Postgres RLS error. */
export async function requireAdmin() {
  const ctx = await requireUser();
  const profile = await getCurrentProfile();
  if (!profile?.is_admin) throw new Error("Administrator access required");
  return ctx;
}

/** Every module's permissions for the signed-in user, in one round trip —
 *  used to decide what the sidebar shows. This is UX only: RLS on the
 *  underlying tables is what actually stops a disallowed read or write, so a
 *  stale or bypassed value here can never expose data, only mis-render a
 *  link. Admins get every module fully open without needing am_permissions
 *  rows to back it (matches am_has_permission's is_admin OR-bypass). */
export const getMyPermissionMap = cache(async function getMyPermissionMap(): Promise<{
  isAdmin: boolean;
  modules: Record<ModuleName, ModulePermissions>;
}> {
  const { supabase, user } = await requireUser();
  const { data: profile } = await supabase
    .from("am_profiles")
    .select("is_admin, role_id")
    .eq("id", user.id)
    .single();

  const isAdmin = profile?.is_admin ?? false;
  const modules = Object.fromEntries(
    MODULES.map((m) => [m.value, { create: isAdmin, read: isAdmin, update: isAdmin, delete: isAdmin }]),
  ) as Record<ModuleName, ModulePermissions>;

  if (!isAdmin && profile?.role_id) {
    const { data: perms } = await supabase.from("am_permissions").select("*").eq("role_id", profile.role_id);
    for (const p of perms ?? []) {
      modules[p.module as ModuleName] = {
        create: p.can_create,
        read: p.can_read,
        update: p.can_update,
        delete: p.can_delete,
      };
    }
  }

  return { isAdmin, modules };
});

/** App-layer permission check — a friendly early error before the RLS round
 *  trip, for pages/actions that want to fail fast. RLS on the underlying
 *  table is still the real enforcement; this is never the only gate. */
export async function requirePermission(module: ModuleName, action: CrudAction) {
  const { supabase, ...rest } = await requireUser();
  const { data } = await supabase.rpc("am_has_permission", { p_module: module, p_action: action });
  if (!data) throw new Error("You don't have permission to do that");
  return { supabase, ...rest };
}

/** Non-throwing permission check for a Server Component page to decide what
 *  to render — a dedicated /new or /import route reachable by direct URL
 *  regardless of whether its trigger button is shown, so hiding the button
 *  alone isn't enough. Reuses getMyPermissionMap()'s cache, so pairing this
 *  with the layout's own call costs no extra round trip. */
export async function canAccess(module: ModuleName, action: CrudAction) {
  const { isAdmin, modules } = await getMyPermissionMap();
  return isAdmin || Boolean(modules[module]?.[action]);
}
