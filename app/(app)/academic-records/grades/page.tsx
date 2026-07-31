import { activeYearId, getLookups } from "@/lib/data/lookups";
import { GradesClient } from "./grades-client";

export const metadata = { title: "Grade entry" };

export default async function GradesPage() {
  const lookups = await getLookups();
  return <GradesClient lookups={lookups} defaultYearId={activeYearId(lookups)} />;
}
