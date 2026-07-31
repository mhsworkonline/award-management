import { NextResponse } from "next/server";
import { requireUser } from "@/lib/supabase/server";
import { ORG_ID } from "@/lib/constants";
import { writeAudit } from "@/lib/audit";
import { distributionSyncSchema } from "@/lib/validators";

/** Drain endpoint for the offline check-off queue.
 *
 *  Idempotency contract: the client generates local_uuid once per check-off and
 *  replays the same value until the server confirms it. A record already carrying
 *  that local_uuid is treated as success, so a lost response never double-applies
 *  and never strands the queue. */
export async function POST(request: Request) {
  let actor = "unknown";

  try {
    const auth = await requireUser();
    actor = auth.actor;
    const supabase = auth.supabase;

    const parsed = distributionSyncSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ error: "Malformed sync payload" }, { status: 400 });
    }

    const synced: string[] = [];
    const failed: { id: string; error: string }[] = [];

    for (const entry of parsed.data.entries) {
      const distributed = entry.status === "distributed";

      // Already applied? Same local_uuid on the same row means this is a replay.
      const { data: existing } = await supabase
        .from("distribution_records")
        .select("id, local_uuid, status")
        .eq("org_id", ORG_ID)
        .eq("id", entry.distribution_id)
        .maybeSingle();

      if (!existing) {
        failed.push({ id: entry.distribution_id, error: "Record no longer exists" });
        continue;
      }

      if (existing.local_uuid === entry.local_uuid) {
        synced.push(entry.distribution_id);
        continue;
      }

      const { error } = await supabase
        .from("distribution_records")
        .update({
          status: entry.status,
          distributed_at: distributed
            ? (entry.distributed_at ?? new Date().toISOString())
            : null,
          distributed_by: distributed ? actor : null,
          sync_status: "synced",
          local_uuid: entry.local_uuid,
        })
        .eq("org_id", ORG_ID)
        .eq("id", entry.distribution_id);

      if (error) {
        failed.push({ id: entry.distribution_id, error: error.message });
        continue;
      }

      synced.push(entry.distribution_id);
    }

    if (synced.length > 0) {
      await writeAudit(supabase, {
        entity: "distribution_records",
        entityId: null,
        action: "update",
        actor,
        diff: { source: "offline_sync", synced: synced.length, failed: failed.length },
      });
    }

    return NextResponse.json({ synced, failed });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Sync failed";
    const status = msg === "Not authenticated" ? 401 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
