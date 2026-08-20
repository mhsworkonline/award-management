import { getLookups } from "@/lib/data/lookups";
import { listApplicationForms } from "@/lib/data/application-forms";
import { FormsClient } from "./forms-client";

export const metadata = { title: "Forms" };

export default async function FormsPage() {
  const [lookups, forms] = await Promise.all([getLookups(), listApplicationForms()]);
  return <FormsClient forms={forms} lookups={lookups} />;
}
