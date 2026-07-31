import { activeYearId, getLookups } from "@/lib/data/lookups";
import { NewStudentForm } from "./new-student-form";

export const metadata = { title: "Add student" };

export default async function NewStudentPage({
  searchParams,
}: {
  searchParams: { academic_year_id?: string; institution_id?: string };
}) {
  const lookups = await getLookups();
  const defaultYearId = searchParams.academic_year_id ?? activeYearId(lookups);

  return (
    <NewStudentForm
      lookups={lookups}
      defaultYearId={defaultYearId}
      defaultInstitutionId={searchParams.institution_id ?? null}
    />
  );
}
