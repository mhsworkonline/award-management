"use server";

import { cache } from "react";
import { revalidatePath } from "next/cache";
import { requireUser, createClient } from "@/lib/supabase/server";
import { ORG_ID } from "@/lib/constants";
import { buildDiff, writeAudit } from "@/lib/audit";
import { friendly, message } from "@/lib/actions/crud";
import { organizationBrandingSchema } from "@/lib/validators";
import { BRANDING_BUCKET, FN, T } from "@/lib/tables";
import type { ActionResult, Organization } from "@/lib/types";

/** Staff-only read of the org row — powers the Settings → Branding tab. */
export async function getOrganization(): Promise<ActionResult<Organization>> {
  try {
    const { supabase } = await requireUser();
    const { data, error } = await supabase
      .from(T.organizations)
      .select("id, name, app_name, logo_path, created_at")
      .eq("id", ORG_ID)
      .single();
    if (error || !data) return { ok: false, error: error?.message ?? "Organization not found" };
    return { ok: true, data: data as Organization };
  } catch (e) {
    return { ok: false, error: message(e) };
  }
}

function revalidateAll() {
  revalidatePath("/settings");
  revalidatePath("/apply");
}

/** The name shown to students on the public application header/title. */
export async function updateAppName(raw: unknown): Promise<ActionResult<null>> {
  const parsed = organizationBrandingSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      error: "Please correct the highlighted fields",
      fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
    };
  }

  try {
    const { supabase, actor } = await requireUser();
    const { data: before } = await supabase.from(T.organizations).select("*").eq("id", ORG_ID).single();

    const { data, error } = await supabase
      .from(T.organizations)
      .update({ app_name: parsed.data.app_name })
      .eq("id", ORG_ID)
      .select()
      .single();
    if (error) return { ok: false, error: friendly(error.message) };

    await writeAudit(supabase, {
      entity: "organizations",
      entityId: ORG_ID,
      action: "update",
      actor,
      diff: buildDiff(before ?? null, data),
    });
    revalidateAll();
    return { ok: true, data: null };
  } catch (e) {
    return { ok: false, error: message(e) };
  }
}

/** Records the logo's Storage path after the file itself has already been
 *  uploaded client-side (public bucket, staff-only write) — removes the
 *  previous logo object so old files don't pile up unreferenced. */
export async function updateLogo(path: string): Promise<ActionResult<null>> {
  try {
    const { supabase, actor } = await requireUser();
    const { data: before } = await supabase
      .from(T.organizations)
      .select("logo_path")
      .eq("id", ORG_ID)
      .single();

    const { error } = await supabase.from(T.organizations).update({ logo_path: path }).eq("id", ORG_ID);
    if (error) return { ok: false, error: friendly(error.message) };

    if (before?.logo_path && before.logo_path !== path) {
      await supabase.storage.from(BRANDING_BUCKET).remove([before.logo_path]);
    }

    await writeAudit(supabase, {
      entity: "organizations",
      entityId: ORG_ID,
      action: "update",
      actor,
      diff: { logo_path: { from: before?.logo_path ?? null, to: path } },
    });
    revalidateAll();
    return { ok: true, data: null };
  } catch (e) {
    return { ok: false, error: message(e) };
  }
}

export async function removeLogo(): Promise<ActionResult<null>> {
  try {
    const { supabase, actor } = await requireUser();
    const { data: before } = await supabase
      .from(T.organizations)
      .select("logo_path")
      .eq("id", ORG_ID)
      .single();
    if (!before?.logo_path) return { ok: true, data: null };

    const { error } = await supabase.from(T.organizations).update({ logo_path: null }).eq("id", ORG_ID);
    if (error) return { ok: false, error: friendly(error.message) };

    await supabase.storage.from(BRANDING_BUCKET).remove([before.logo_path]);

    await writeAudit(supabase, {
      entity: "organizations",
      entityId: ORG_ID,
      action: "update",
      actor,
      diff: { logo_path: { from: before.logo_path, to: null } },
    });
    revalidateAll();
    return { ok: true, data: null };
  } catch (e) {
    return { ok: false, error: message(e) };
  }
}

/** Unauthenticated — the org name/logo shown on the public /apply header,
 *  via a security-definer RPC (anon has no direct read on am_organizations).
 *  Wrapped in React's request-scoped cache so the layout and its metadata
 *  export share one round trip instead of two. */
export const getPublicBranding = cache(async (): Promise<{ app_name: string; logo_url: string | null }> => {
  const supabase = createClient();
  const { data } = await supabase.rpc(FN.publicBranding, { p_org_id: ORG_ID });
  const row = data as { app_name?: string; logo_path?: string | null } | null;
  const appName = row?.app_name || "Award Application";
  const logoUrl = row?.logo_path
    ? supabase.storage.from(BRANDING_BUCKET).getPublicUrl(row.logo_path).data.publicUrl
    : null;
  return { app_name: appName, logo_url: logoUrl };
});
