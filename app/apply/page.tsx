import type { Metadata } from "next";
import { getPublicBranding } from "@/lib/actions/organization";
import { resolveApplicationForm } from "@/lib/actions/public-application";
import { ResolveAndRenderApply } from "./resolve-and-render";

/** Title/description for link previews (WhatsApp, iMessage, …) — the
 *  matching thumbnail image comes from opengraph-image.tsx alongside this file. */
export async function generateMetadata(): Promise<Metadata> {
  const [branding, formResult] = await Promise.all([getPublicBranding(), resolveApplicationForm()]);
  const form = formResult.ok ? formResult.data : null;
  const title = form?.title || "Apply for Award";
  const description = form?.description || "Annual student merit awards and prize distribution";

  return {
    title,
    description,
    openGraph: { title: `${branding.app_name} — ${title}`, description },
  };
}

export default async function ApplyPage() {
  return <ResolveAndRenderApply />;
}
