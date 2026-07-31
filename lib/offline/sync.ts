"use client";

import { dequeue, getQueue, markQueueError } from "@/lib/offline/db";

export type SyncResult = {
  attempted: number;
  synced: number;
  failed: number;
  error?: string;
};

/** Drains the IndexedDB queue into Supabase. Idempotent: the server upserts by
 *  local_uuid, so replaying the same batch is safe. */
export async function syncQueue(): Promise<SyncResult> {
  const queue = await getQueue();
  if (queue.length === 0) return { attempted: 0, synced: 0, failed: 0 };

  const entries = queue.map((q) => ({
    local_uuid: q.local_uuid,
    distribution_id: q.distribution_id,
    status: q.status,
    distributed_at: q.distributed_at,
  }));

  try {
    const res = await fetch("/api/distribution/sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ entries }),
    });

    if (!res.ok) {
      const message = await safeMessage(res);
      await markQueueError(
        queue.map((q) => q.distribution_id),
        message,
      );
      return { attempted: entries.length, synced: 0, failed: entries.length, error: message };
    }

    const body = (await res.json()) as { synced: string[]; failed: { id: string; error: string }[] };
    if (body.synced?.length) await dequeue(body.synced);
    if (body.failed?.length) {
      await markQueueError(
        body.failed.map((f) => f.id),
        body.failed[0]?.error ?? "Sync rejected",
      );
    }

    return {
      attempted: entries.length,
      synced: body.synced?.length ?? 0,
      failed: body.failed?.length ?? 0,
      error: body.failed?.[0]?.error,
    };
  } catch (e) {
    const message = e instanceof Error ? e.message : "Network unavailable";
    return { attempted: entries.length, synced: 0, failed: entries.length, error: message };
  }
}

async function safeMessage(res: Response) {
  try {
    const body = await res.json();
    return body?.error ?? `Sync failed (${res.status})`;
  } catch {
    return `Sync failed (${res.status})`;
  }
}
