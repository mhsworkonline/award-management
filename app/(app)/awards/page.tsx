import { activeYearId, getLookups } from "@/lib/data/lookups";
import { listAwards } from "@/lib/data/awards";
import { listTopPerformers } from "@/lib/data/academic-records";
import { AwardsClient } from "./awards-client";

export const metadata = { title: "Awards" };

export default async function AwardsPage({
  searchParams,
}: {
  searchParams: Record<string, string | undefined>;
}) {
  const lookups = await getLookups();
  const yearId = searchParams.academic_year_id ?? activeYearId(lookups) ?? undefined;

  const [rows, performers] = await Promise.all([
    listAwards({
      academic_year_id: yearId,
      institution_id: searchParams.institution_id,
      award_category_id: searchParams.award_category_id,
      q: searchParams.q,
    }),
    yearId
      ? listTopPerformers({
          academic_year_id: yearId,
          institution_id: searchParams.institution_id,
          limit: 10,
        })
      : Promise.resolve([]),
  ]);

  return (
    <AwardsClient rows={rows} performers={performers} lookups={lookups} defaultYearId={yearId ?? null} />
  );
}
