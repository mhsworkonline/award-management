import { getPublicBranding } from "@/lib/actions/organization";
import { OG_IMAGE_SIZE, renderApplyOgImage } from "@/lib/og-image";

export const size = OG_IMAGE_SIZE;
export const contentType = "image/png";
export const alt = "Confirm Your Details";

/** WhatsApp/iMessage/etc. link-preview thumbnail for /confirm (org default
 *  confirm-type form, no slug) — Next.js wires this up as the page's
 *  og:image automatically. Reuses the exact renderer /apply's own
 *  thumbnail uses (see lib/og-image.tsx) — logo + org name only, so every
 *  public page in the app shares the same simple banner. */
export default async function Image() {
  const branding = await getPublicBranding();
  return renderApplyOgImage({ appName: branding.app_name, logoUrl: branding.logo_url });
}
