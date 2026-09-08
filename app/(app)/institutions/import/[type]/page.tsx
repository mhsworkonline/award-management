import { notFound } from "next/navigation";
import { canAccess } from "@/lib/supabase/server";
import { AccessRestricted } from "@/components/shell/access-restricted";
import { InstitutionImportWizard } from "./institution-import-wizard";
import type { InstitutionImportType } from "@/lib/excel/institutions-workbook";

export function generateMetadata({ params }: { params: { type: string } }) {
  const label = params.type === "college" ? "colleges" : "schools";
  return { title: `Import ${label}` };
}

export default async function InstitutionImportPage({ params }: { params: { type: string } }) {
  if (params.type !== "school" && params.type !== "college") notFound();

  const canCreate = await canAccess("institutions", "create");
  if (!canCreate) return <AccessRestricted />;

  return <InstitutionImportWizard type={params.type as InstitutionImportType} />;
}
