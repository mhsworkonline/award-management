"use client";

import * as React from "react";
import { toast } from "sonner";
import { getQueueCount } from "@/lib/offline/db";
import { syncQueue, type SyncResult } from "@/lib/offline/sync";

type OfflineCtx = {
  online: boolean;
  pending: number;
  syncing: boolean;
  refreshPending: () => Promise<void>;
  runSync: (opts?: { silent?: boolean }) => Promise<SyncResult | null>;
};

const Ctx = React.createContext<OfflineCtx | null>(null);

export function useOffline() {
  const ctx = React.useContext(Ctx);
  if (!ctx) throw new Error("useOffline must be used inside OfflineSyncProvider");
  return ctx;
}

export function OfflineSyncProvider({ children }: { children: React.ReactNode }) {
  const [online, setOnline] = React.useState(true);
  const [pending, setPending] = React.useState(0);
  const [syncing, setSyncing] = React.useState(false);
  const syncingRef = React.useRef(false);

  const refreshPending = React.useCallback(async () => {
    try {
      setPending(await getQueueCount());
    } catch {
      /* IndexedDB unavailable (private mode) — offline queue simply won't be used */
    }
  }, []);

  const runSync = React.useCallback(
    async (opts?: { silent?: boolean }) => {
      if (syncingRef.current) return null;
      if (typeof navigator !== "undefined" && !navigator.onLine) return null;

      const count = await getQueueCount().catch(() => 0);
      if (count === 0) {
        setPending(0);
        return { attempted: 0, synced: 0, failed: 0 };
      }

      syncingRef.current = true;
      setSyncing(true);
      try {
        const result = await syncQueue();
        await refreshPending();
        if (!opts?.silent) {
          if (result.synced > 0 && result.failed === 0) {
            toast.success(`Synced ${result.synced} check-off${result.synced === 1 ? "" : "s"}`);
          } else if (result.failed > 0) {
            toast.error(`${result.failed} check-off(s) could not sync`, {
              description: result.error,
            });
          }
        } else if (result.synced > 0) {
          toast.success(`Synced ${result.synced} offline check-off${result.synced === 1 ? "" : "s"}`);
        }
        return result;
      } finally {
        syncingRef.current = false;
        setSyncing(false);
      }
    },
    [refreshPending],
  );

  React.useEffect(() => {
    setOnline(navigator.onLine);
    void refreshPending();

    const onOnline = () => {
      setOnline(true);
      void runSync({ silent: true });
    };
    const onOffline = () => setOnline(false);

    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);

    // Catch-up sweep: covers the case where the tab was closed with a full queue.
    const interval = window.setInterval(() => {
      if (navigator.onLine) void runSync({ silent: true });
    }, 60_000);

    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      window.clearInterval(interval);
    };
  }, [refreshPending, runSync]);

  const value = React.useMemo(
    () => ({ online, pending, syncing, refreshPending, runSync }),
    [online, pending, syncing, refreshPending, runSync],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
