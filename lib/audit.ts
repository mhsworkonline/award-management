import type { SupabaseClient } from "@supabase/supabase-js";
import { ORG_ID } from "@/lib/constants";
import { T } from "@/lib/tables";
import type { AuditAction } from "@/lib/types";

/** Server-side only. Every create/update/delete calls this; failures are swallowed
 *  so an audit hiccup never rolls back the user's actual work, but they are logged. */
export async function writeAudit(
  supabase: SupabaseClient,
  params: {
    entity: string;
    entityId?: string | null;
    action: AuditAction;
    actor: string;
    diff?: Record<string, unknown> | null;
  },
) {
  const { error } = await supabase.from(T.auditLogs).insert({
    org_id: ORG_ID,
    entity_name: params.entity,
    entity_id: params.entityId ?? null,
    action: params.action,
    actor: params.actor,
    diff_json: params.diff ?? null,
  });

  if (error) console.error("[audit] failed:", error.message, params);
}

export async function logError(
  supabase: SupabaseClient,
  params: { route: string; message: string; stack?: string | null },
) {
  await supabase.from(T.errorLogs).insert({
    org_id: ORG_ID,
    route: params.route,
    message: params.message,
    stack: params.stack ?? null,
  });
}

/** Field-level diff, skipping unchanged and internal fields. */
export function buildDiff(
  before: Record<string, unknown> | null,
  after: Record<string, unknown> | null,
) {
  const skip = new Set(["id", "org_id", "created_at", "updated_at"]);
  if (!before) return { created: pick(after, skip) };
  if (!after) return { deleted: pick(before, skip) };

  const changes: Record<string, { from: unknown; to: unknown }> = {};
  for (const key of new Set([...Object.keys(before), ...Object.keys(after)])) {
    if (skip.has(key)) continue;
    if (JSON.stringify(before[key]) !== JSON.stringify(after[key])) {
      changes[key] = { from: before[key] ?? null, to: after[key] ?? null };
    }
  }
  return changes;
}

function pick(obj: Record<string, unknown> | null, skip: Set<string>) {
  if (!obj) return {};
  return Object.fromEntries(Object.entries(obj).filter(([k]) => !skip.has(k)));
}
