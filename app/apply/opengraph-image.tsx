import { getPublicBranding } from "@/lib/actions/organization";
import { OG_IMAGE_SIZE, renderApplyOgImage } from "@/lib/og-image";

export const size = OG_IMAGE_SIZE;
export const contentType = "image/png";
export const alt = "Student Award Application";

/** WhatsApp/iMessage/etc. link-preview thumbnail for /apply (org default
 *  form, no slug) — Next.js wires this up as the page's og:image automatically. */
export default async function Image() {
  const branding = await getPublicBranding();
  return renderApplyOgImage({ appName: branding.app_name, logoUrl: branding.logo_url });
}
