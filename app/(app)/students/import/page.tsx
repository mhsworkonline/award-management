import { activeYearId, getLookups } from "@/lib/data/lookups";
import { ImportWizard } from "./import-wizard";

export const metadata = { title: "Import students" };

export default async function ImportPage() {
  const lookups = await getLookups();
  return <ImportWizard lookups={lookups} defaultYearId={activeYearId(lookups)} />;
}
