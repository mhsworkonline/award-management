import { createClient as createSupabaseClient } from "@supabase/supabase-js";

/** Service-role client — bypasses RLS entirely and can call the Auth Admin
 *  API (create/update/delete users). Server-only: never import this from a
 *  client component, and never let SUPABASE_SERVICE_ROLE_KEY carry the
 *  NEXT_PUBLIC_ prefix. Used exclusively by lib/actions/users.ts, gated on
 *  is_admin before this is ever reached. */
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY is not set. Add it to .env.local from " +
        "Supabase Dashboard → Project Settings → API → service_role secret — " +
        "required for creating or removing user accounts.",
    );
  }

  return createSupabaseClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
