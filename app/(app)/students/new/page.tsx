import { activeYearId, getLookups } from "@/lib/data/lookups";
import { canAccess } from "@/lib/supabase/server";
import { AccessRestricted } from "@/components/shell/access-restricted";
import { NewStudentForm } from "./new-student-form";

export const metadata = { title: "Add student" };

export default async function NewStudentPage({
  searchParams,
}: {
  searchParams: { academic_year_id?: string; institution_id?: string };
}) {
  // Adding a student also creates its first academic-year enrollment in the
  // same action, so both permissions are required — see 0022's migration note.
  const [canCreateStudent, canCreateRecord] = await Promise.all([
    canAccess("students", "create"),
    canAccess("academic_records", "create"),
  ]);
  if (!canCreateStudent || !canCreateRecord) return <AccessRestricted />;

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
