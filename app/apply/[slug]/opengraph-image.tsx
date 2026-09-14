import { getPublicBranding } from "@/lib/actions/organization";
import { resolveApplicationForm } from "@/lib/actions/public-application";
import { OG_IMAGE_SIZE, renderApplyOgImage } from "@/lib/og-image";

export const size = OG_IMAGE_SIZE;
export const contentType = "image/png";
export const alt = "Student Award Application";

/** WhatsApp/iMessage/etc. link-preview thumbnail for a specific form's
 *  /apply/[slug] link — Next.js wires this up as the page's og:image automatically. */
export default async function Image({ params }: { params: { slug: string } }) {
  const [branding, formResult] = await Promise.all([
    getPublicBranding(),
    resolveApplicationForm(params.slug),
  ]);
  const form = formResult.ok ? formResult.data : null;

  return renderApplyOgImage({
    appName: branding.app_name,
    logoUrl: branding.logo_url,
    heading: form?.title || "Student Award Application",
    subheading: form?.academicYear?.label ?? null,
  });
}
