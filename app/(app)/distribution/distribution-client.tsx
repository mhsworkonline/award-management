"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  CheckCircle2,
  ClipboardList,
  CloudOff,
  Download,
  Loader2,
  RefreshCw,
  WifiOff,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableWrap,
} from "@/components/ui/table";
import { EmptyState, PageHeader } from "@/components/shell/page-header";
import { FilterBar } from "@/components/data-table/filter-bar";
import { useOffline } from "@/components/offline/offline-sync-provider";
import { setDistributionStatus } from "@/lib/actions/distribution";
import {
  cacheDistributionRows,
  enqueueCheckoff,
  getCachedDistributionRows,
  getQueue,
  newLocalUuid,
} from "@/lib/offline/db";
import { formatDateTime } from "@/lib/utils";
import type { DistributionRow, Lookups } from "@/lib/types";

export function DistributionClient({
  rows: serverRows,
  lookups,
  pdfQuery,
}: {
  rows: DistributionRow[];
  lookups: Lookups;
  pdfQuery: string;
}) {
  const router = useRouter();
  const { online, pending, syncing, runSync, refreshPending } = useOffline();

  const [rows, setRows] = React.useState(serverRows);
  const [busyId, setBusyId] = React.useState<string | null>(null);
  const [queuedIds, setQueuedIds] = React.useState<Set<string>>(new Set());
  const [usingCache, setUsingCache] = React.useState(false);

  // Server data wins whenever it arrives; cache it so the venue screen survives
  // losing connectivity mid-ceremony.
  React.useEffect(() => {
    setRows(serverRows);
    setUsingCache(false);
    if (serverRows.length > 0) void cacheDistributionRows(serverRows);
  }, [serverRows]);

  // Offline with nothing from the server: fall back to the last cached worklist.
  React.useEffect(() => {
    if (online || serverRows.length > 0) return;
    void (async () => {
      const cached = await getCachedDistributionRows();
      if (cached.length > 0) {
        setRows(cached);
        setUsingCache(true);
      }
    })();
  }, [online, serverRows.length]);

  // Reflect locally queued check-offs in the table.
  React.useEffect(() => {
    void (async () => {
      const queue = await getQueue().catch(() => []);
      setQueuedIds(new Set(queue.map((q) => q.distribution_id)));
    })();
  }, [pending]);

  async function toggle(row: DistributionRow, checked: boolean) {
    const status = checked ? "distributed" : "pending";
    const distributedAt = checked ? new Date().toISOString() : null;

    // Optimistic — the ceremony can't wait for a round trip.
    setRows((prev) =>
      prev.map((r) =>
        r.id === row.id
          ? { ...r, status, distributed_at: distributedAt, sync_status: online ? "synced" : "queued_offline" }
          : r,
      ),
    );

    if (!online) {
      await enqueueCheckoff({
        local_uuid: newLocalUuid(),
        distribution_id: row.id,
        status,
        distributed_at: distributedAt,
      });
      setQueuedIds((prev) => new Set(prev).add(row.id));
      await refreshPending();
      toast.success(`${row.student_name} — saved offline`, {
        description: "Will sync automatically when back online.",
      });
      return;
    }

    setBusyId(row.id);
    const result = await setDistributionStatus({ id: row.id, status });
    setBusyId(null);

    if (!result.ok) {
      // Connectivity may have dropped between the check and the write — queue it
      // rather than losing the operator's action.
      await enqueueCheckoff({
        local_uuid: newLocalUuid(),
        distribution_id: row.id,
        status,
        distributed_at: distributedAt,
      });
      setQueuedIds((prev) => new Set(prev).add(row.id));
      await refreshPending();
      toast.error("Saved offline instead", { description: result.error });
      return;
    }

    router.refresh();
  }

  const distributed = rows.filter((r) => r.status === "distributed").length;
  const progress = rows.length === 0 ? 0 : Math.round((distributed / rows.length) * 100);

  return (
    <>
      <PageHeader
        title="Gift distribution"
        description="Tick each gift as it is handed over. Works offline at the venue."
        actions={
          <>
            <Button asChild variant="outline">
              <a href={`/api/reports/pdf${pdfQuery}`} target="_blank" rel="noreferrer">
                <Download /> Print list
              </a>
            </Button>
            {pending > 0 && (
              <Button onClick={() => void runSync()} disabled={syncing || !online}>
                {syncing ? <Loader2 className="animate-spin" /> : <RefreshCw />}
                Sync {pending}
              </Button>
            )}
          </>
        }
      />

      {!online && (
        <div className="flex items-start gap-2.5 rounded-lg border border-warning/40 bg-warning/8 px-3.5 py-3">
          <WifiOff className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
          <div className="text-[13px]">
            <p className="font-semibold text-warning">Working offline</p>
            <p className="text-muted-foreground">
              Check-offs are saved on this device and sync automatically when the connection
              returns. Don&apos;t clear the browser data before syncing.
              {usingCache && " Showing the last list loaded while online."}
            </p>
          </div>
        </div>
      )}

      {online && pending > 0 && (
        <div className="flex items-start gap-2.5 rounded-lg border border-primary/30 bg-primary/8 px-3.5 py-3">
          <CloudOff className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
          <div className="text-[13px]">
            <p className="font-semibold text-primary">
              {pending} check-off{pending === 1 ? "" : "s"} waiting to sync
            </p>
            <p className="text-muted-foreground">
              They will upload automatically, or press Sync to send them now.
            </p>
          </div>
        </div>
      )}

      <FilterBar
        lookups={lookups}
        advanced={["institution_id", "award_category_id", "status"]}
        searchPlaceholder="Search student name…"
      >
        <Badge variant={progress === 100 && rows.length > 0 ? "success" : "secondary"}>
          {distributed} / {rows.length} handed out
        </Badge>
      </FilterBar>

      <TableWrap className="max-h-[calc(100vh-360px)]">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-12">
                <span className="sr-only">Distributed</span>
              </TableHead>
              <TableHead className="w-[20%]">Student</TableHead>
              <TableHead className="w-[19%]">Institution</TableHead>
              <TableHead className="w-[11%]">Std / Course</TableHead>
              <TableHead className="w-[11%]">Award</TableHead>
              <TableHead className="w-[17%]">Gift</TableHead>
              <TableHead className="w-[18%]">Status</TableHead>
            </TableRow>
          </TableHeader>

          <TableBody>
            {rows.length === 0 ? (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={7} className="border-b-0">
                  <EmptyState
                    icon={ClipboardList}
                    title="Nothing to distribute"
                    description="Allocate gifts against awards first — each allocation creates a pending distribution entry here."
                  />
                </TableCell>
              </TableRow>
            ) : (
              rows.map((row) => {
                const done = row.status === "distributed";
                const queued = queuedIds.has(row.id);
                return (
                  <TableRow key={row.id} className={done ? "bg-success/5" : undefined}>
                    <TableCell>
                      {busyId === row.id ? (
                        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                      ) : (
                        <Checkbox
                          checked={done}
                          onCheckedChange={(c) => void toggle(row, Boolean(c))}
                          aria-label={`Mark ${row.student_name}'s gift as distributed`}
                        />
                      )}
                    </TableCell>
                    <TableCell>
                      <span className="font-medium">{row.student_name}</span>
                      {row.father_name && (
                        <span className="block text-[12px] text-muted-foreground">
                          s/o {row.father_name}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      <span className="truncate">{row.institution_name}</span>
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">{row.placement}</Badge>
                    </TableCell>
                    <TableCell>
                      <Badge>{row.award_category}</Badge>
                    </TableCell>
                    <TableCell>
                      {row.gift_name}
                      {row.quantity > 1 && (
                        <span className="tabular text-muted-foreground"> ×{row.quantity}</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {queued ? (
                        <Badge variant="warning">
                          <CloudOff className="h-3 w-3" /> Queued offline
                        </Badge>
                      ) : done ? (
                        <span className="flex items-center gap-1.5">
                          <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-success" />
                          <span className="text-[12px] text-muted-foreground">
                            {formatDateTime(row.distributed_at)}
                          </span>
                        </span>
                      ) : (
                        <Badge variant="outline">Pending</Badge>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </TableWrap>
    </>
  );
}
