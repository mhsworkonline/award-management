import { activeYearId, getLookups } from "@/lib/data/lookups";
import { canAccess } from "@/lib/supabase/server";
import { AccessRestricted } from "@/components/shell/access-restricted";
import { ImportWizard } from "./import-wizard";

export const metadata = { title: "Import students" };

export default async function ImportPage() {
  const [canCreateStudent, canCreateRecord] = await Promise.all([
    canAccess("students", "create"),
    canAccess("academic_records", "create"),
  ]);
  if (!canCreateStudent || !canCreateRecord) return <AccessRestricted />;

  const lookups = await getLookups();
  return <ImportWizard lookups={lookups} defaultYearId={activeYearId(lookups)} />;
}
