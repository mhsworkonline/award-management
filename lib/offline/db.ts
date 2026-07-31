"use client";

import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import type { DistributionRow } from "@/lib/types";

/** Offline scope is deliberately narrow: only the ceremony-day check-off flow.
 *  Everything else in the app is online-only. */

export type QueuedCheckoff = {
  local_uuid: string;
  distribution_id: string;
  status: "pending" | "distributed";
  distributed_at: string | null;
  queued_at: string;
  attempts: number;
  last_error?: string | null;
};

interface AwardDB extends DBSchema {
  /** Pending writes waiting for connectivity. */
  checkoff_queue: {
    key: string; // distribution_id — one pending write per record, last one wins
    value: QueuedCheckoff;
    indexes: { by_queued_at: string };
  };
  /** Snapshot of the worklist so the screen renders with no network. */
  distribution_cache: {
    key: string; // distribution_id
    value: DistributionRow & { cached_at: string };
    indexes: { by_year: string };
  };
  meta: { key: string; value: { key: string; value: string } };
}

const DB_NAME = "award-management";
const DB_VERSION = 1;

let dbPromise: Promise<IDBPDatabase<AwardDB>> | null = null;

export function getDB() {
  if (typeof window === "undefined") throw new Error("IndexedDB is browser-only");
  if (!dbPromise) {
    dbPromise = openDB<AwardDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains("checkoff_queue")) {
          const q = db.createObjectStore("checkoff_queue", { keyPath: "distribution_id" });
          q.createIndex("by_queued_at", "queued_at");
        }
        if (!db.objectStoreNames.contains("distribution_cache")) {
          const c = db.createObjectStore("distribution_cache", { keyPath: "id" });
          c.createIndex("by_year", "academic_year_id");
        }
        if (!db.objectStoreNames.contains("meta")) {
          db.createObjectStore("meta", { keyPath: "key" });
        }
      },
    });
  }
  return dbPromise;
}

export function newLocalUuid() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  // Fallback for older WebViews
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export async function enqueueCheckoff(entry: Omit<QueuedCheckoff, "queued_at" | "attempts">) {
  const db = await getDB();
  await db.put("checkoff_queue", {
    ...entry,
    queued_at: new Date().toISOString(),
    attempts: 0,
  });
}

export async function getQueue(): Promise<QueuedCheckoff[]> {
  const db = await getDB();
  return db.getAllFromIndex("checkoff_queue", "by_queued_at");
}

export async function getQueueCount() {
  const db = await getDB();
  return db.count("checkoff_queue");
}

export async function dequeue(distributionIds: string[]) {
  const db = await getDB();
  const tx = db.transaction("checkoff_queue", "readwrite");
  await Promise.all(distributionIds.map((id) => tx.store.delete(id)));
  await tx.done;
}

export async function markQueueError(distributionIds: string[], message: string) {
  const db = await getDB();
  const tx = db.transaction("checkoff_queue", "readwrite");
  for (const id of distributionIds) {
    const existing = await tx.store.get(id);
    if (existing) {
      await tx.store.put({ ...existing, attempts: existing.attempts + 1, last_error: message });
    }
  }
  await tx.done;
}

export async function cacheDistributionRows(rows: DistributionRow[]) {
  const db = await getDB();
  const tx = db.transaction("distribution_cache", "readwrite");
  const cached_at = new Date().toISOString();
  await Promise.all(rows.map((r) => tx.store.put({ ...r, cached_at })));
  await tx.done;
  await setMeta("distribution_cached_at", cached_at);
}

export async function getCachedDistributionRows(academicYearId?: string) {
  const db = await getDB();
  const rows = academicYearId
    ? await db.getAllFromIndex("distribution_cache", "by_year", academicYearId)
    : await db.getAll("distribution_cache");
  return rows as (DistributionRow & { cached_at: string })[];
}

export async function setMeta(key: string, value: string) {
  const db = await getDB();
  await db.put("meta", { key, value });
}

export async function getMeta(key: string) {
  const db = await getDB();
  return (await db.get("meta", key))?.value ?? null;
}
