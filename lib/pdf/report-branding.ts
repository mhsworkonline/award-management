import { ORG_ID } from "@/lib/constants";
import { BRANDING_BUCKET, T } from "@/lib/tables";
import type { createClient } from "@/lib/supabase/server";

/** Shared by every report PDF route — the org name (same fallback every
 *  report PDF already used) and, when asked for, a logo URL. Only for a
 *  raster image: @react-pdf/renderer's <Image> can't reliably rasterize an
 *  arbitrary uploaded SVG, so an SVG logo (allowed under Settings →
 *  Branding) is silently skipped here rather than breaking PDF generation.
 *
 *  Reads `app_name`, not `name` — `am_organizations.name` is a seed-time
 *  column nothing in the UI ever edits (still literally "Default
 *  Organization" for every org); `app_name` is the one Settings → Branding's
 *  "Application name" field actually writes to (see
 *  lib/actions/organization.ts updateAppName / branding-section.tsx), and
 *  what every other branded surface (public /apply page, sidebar, browser
 *  tab title) already reads. */
export async function resolveReportBranding(
  supabase: ReturnType<typeof createClient>,
  includeLogo: boolean,
): Promise<{ organizationName: string; logoUrl: string | null }> {
  const org = await supabase.from(T.organizations).select("app_name, logo_path").eq("id", ORG_ID).maybeSingle();
  const organizationName = org.data?.app_name || "Award Management";

  const logoPath = org.data?.logo_path ?? null;
  const isRaster = !!logoPath && /\.(png|jpe?g|webp)$/i.test(logoPath);
  const logoUrl =
    includeLogo && isRaster
      ? supabase.storage.from(BRANDING_BUCKET).getPublicUrl(logoPath as string).data.publicUrl
      : null;

  return { organizationName, logoUrl };
}
