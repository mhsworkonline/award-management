import type { Metadata } from "next";
import { getPublicBranding } from "@/lib/actions/organization";
import { resolveConfirmForm } from "@/lib/actions/data-confirmation";
import { ResolveAndRenderConfirm } from "../resolve-and-render";

export async function generateMetadata({ params }: { params: { slug: string } }): Promise<Metadata> {
  const [branding, formResult] = await Promise.all([getPublicBranding(), resolveConfirmForm(params.slug)]);
  const form = formResult.ok ? formResult.data : null;
  const title = form?.title || "Confirm Your Details";

  return {
    title,
    description: "Confirm the details we have on file are correct.",
    openGraph: { title: `${branding.app_name} — ${title}`, description: "" },
  };
}

export default async function ConfirmFormPage({ params }: { params: { slug: string } }) {
  return <ResolveAndRenderConfirm slug={params.slug} />;
}
