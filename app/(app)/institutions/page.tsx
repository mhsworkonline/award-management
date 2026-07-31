import { createClient } from "@/lib/supabase/server";
import { ORG_ID } from "@/lib/constants";
import { getLookups } from "@/lib/data/lookups";
import { InstitutionsClient } from "./institutions-client";
import type { Institution } from "@/lib/types";
import { T } from "@/lib/tables";

export const metadata = { title: "Institutions" };

export default async function InstitutionsPage() {
  const supabase = createClient();

  const [lookups, institutions, students] = await Promise.all([
    getLookups(),
    supabase
      .from(T.institutions)
      .select("*, boards:am_boards ( id, name ), mediums:am_mediums ( id, name )")
      .eq("org_id", ORG_ID)
      .order("name"),
    supabase.from(T.academicRecords).select("institution_id").eq("org_id", ORG_ID).limit(20000),
  ]);

  const studentCounts: Record<string, number> = {};
  for (const row of students.data ?? []) {
    studentCounts[row.institution_id] = (studentCounts[row.institution_id] ?? 0) + 1;
  }

  return (
    <InstitutionsClient
      institutions={(institutions.data ?? []) as unknown as Institution[]}
      studentCounts={studentCounts}
      lookups={lookups}
    />
  );
}
