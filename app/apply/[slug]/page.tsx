import { ResolveAndRenderApply } from "../resolve-and-render";

export default async function ApplyFormPage({ params }: { params: { slug: string } }) {
  return <ResolveAndRenderApply slug={params.slug} />;
}
