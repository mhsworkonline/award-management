import { createClient } from "@/lib/supabase/server";
import { ORG_ID, PAGE_SIZE } from "@/lib/constants";
import { AuditClient } from "./audit-client";
import type { AuditLog } from "@/lib/types";
import { T } from "@/lib/tables";

export const metadata = { title: "Audit log" };

const ENTITIES = [
  "students",
  "institutions",
  "student_awards",
  "gift_items",
  "gift_allocations",
  "distribution_records",
  "academic_years",
  "boards",
  "mediums",
  "courses",
  "standards",
  "award_categories",
];

export default async function AuditPage({
  searchParams,
}: {
  searchParams: Record<string, string | undefined>;
}) {
  const supabase = createClient();

  const page = Math.max(1, Number(searchParams.page ?? 1) || 1);
  const size = Math.min(200, Number(searchParams.size ?? PAGE_SIZE) || PAGE_SIZE);
  const from = (page - 1) * size;

  let query = supabase
    .from(T.auditLogs)
    .select("*", { count: "exact" })
    .eq("org_id", ORG_ID);

  if (searchParams.entity && searchParams.entity !== "all") {
    query = query.eq("entity_name", searchParams.entity);
  }
  if (
    searchParams.action &&
    ["create", "update", "delete"].includes(searchParams.action)
  ) {
    query = query.eq("action", searchParams.action);
  }
  if (searchParams.actor) {
    query = query.ilike("actor", `%${searchParams.actor.replace(/[%,]/g, "")}%`);
  }

  const { data, count } = await query
    .order("created_at", { ascending: false })
    .range(from, from + size - 1);

  return (
    <AuditClient
      logs={(data ?? []) as AuditLog[]}
      total={count ?? 0}
      page={page}
      size={size}
      entities={ENTITIES}
    />
  );
}
