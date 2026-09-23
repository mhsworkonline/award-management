import type { Metadata } from "next";
import { getPublicBranding } from "@/lib/actions/organization";
import { resolveConfirmForm } from "@/lib/actions/data-confirmation";
import { ResolveAndRenderConfirm } from "./resolve-and-render";

/** Title for link previews (WhatsApp, iMessage, …) — the matching thumbnail
 *  image comes from opengraph-image.tsx alongside this file, same split
 *  /apply/page.tsx uses. og:description is deliberately left blank so the
 *  preview card shows only the image and title. */
export async function generateMetadata(): Promise<Metadata> {
  const [branding, formResult] = await Promise.all([getPublicBranding(), resolveConfirmForm()]);
  const form = formResult.ok ? formResult.data : null;
  const title = form?.title || "Confirm Your Details";

  return {
    title,
    description: "Confirm the details we have on file are correct.",
    openGraph: { title: `${branding.app_name} — ${title}`, description: "" },
  };
}

export default async function ConfirmPage() {
  return <ResolveAndRenderConfirm />;
}
