import { activeYearId, getLookups } from "@/lib/data/lookups";
import { listAwards } from "@/lib/data/awards";
import { listAcademicRecords, listTopPerformers } from "@/lib/data/academic-records";
import { parseFilters } from "@/lib/data/reports";
import { AwardsClient } from "./awards-client";

export const metadata = { title: "Awards" };

export default async function AwardsPage({
  searchParams,
}: {
  searchParams: Record<string, string | undefined>;
}) {
  const lookups = await getLookups();
  const yearId = searchParams.academic_year_id ?? activeYearId(lookups) ?? undefined;

  // Two views over the same filters: "candidates" (every student with a
  // record this year, each with an Assign award button — by default only
  // those with no award yet — the default tab, since deciding who still
  // needs an award is the more common task) and "awarded" (the awards
  // themselves). Only the active view's data is fetched.
  const view = searchParams.view === "awarded" ? "awarded" : "candidates";
  const includeAwarded = searchParams.include_awarded === "1";

  if (view === "candidates") {
    const filters = parseFilters(searchParams);
    filters.academic_year_id = yearId;
    // An award-category filter only means something for students who already
    // have that award, so it's ignored while the list is "not yet awarded".
    if (!includeAwarded) delete filters.award_category_id;

    const candidates = await listAcademicRecords(filters, { unawarded: !includeAwarded });

    return (
      <AwardsClient
        view="candidates"
        rows={[]}
        performers={[]}
        candidates={candidates}
        includeAwarded={includeAwarded}
        lookups={lookups}
        defaultYearId={yearId ?? null}
      />
    );
  }

  const [rows, performers] = await Promise.all([
    listAwards({
      academic_year_id: yearId,
      institution_id: searchParams.institution_id,
      institution_type: searchParams.institution_type,
      board_id: searchParams.board_id,
      standard_id: searchParams.standard_id,
      stream_id: searchParams.stream_id,
      award_category_id: searchParams.award_category_id,
      q: searchParams.q,
    }),
    yearId
      ? listTopPerformers({
          academic_year_id: yearId,
          institution_id: searchParams.institution_id,
          q: searchParams.q,
          limit: 10,
        })
      : Promise.resolve([]),
  ]);

  return (
    <AwardsClient
      view="awarded"
      rows={rows}
      performers={performers}
      candidates={null}
      includeAwarded={false}
      lookups={lookups}
      defaultYearId={yearId ?? null}
    />
  );
}
