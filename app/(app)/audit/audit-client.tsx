"use client";

import * as React from "react";
import { ScrollText } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
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
import { Pagination } from "@/components/data-table/pagination";
import { useQueryParams } from "@/hooks/use-query-params";
import { formatDateTime } from "@/lib/utils";
import type { AuditLog } from "@/lib/types";

const ENTITY_LABELS: Record<string, string> = {
  students: "Students",
  institutions: "Institutions",
  student_awards: "Awards",
  gift_items: "Gift items",
  gift_allocations: "Gift allocations",
  distribution_records: "Distribution",
  academic_years: "Academic years",
  boards: "Boards",
  mediums: "Mediums",
  courses: "Courses",
  standards: "Standards",
  award_categories: "Award categories",
};

export function AuditClient({
  logs,
  total,
  page,
  size,
  entities,
}: {
  logs: AuditLog[];
  total: number;
  page: number;
  size: number;
  entities: string[];
}) {
  const { searchParams, setParams } = useQueryParams();
  const [detail, setDetail] = React.useState<AuditLog | null>(null);
  const [actor, setActor] = React.useState(searchParams.get("actor") ?? "");

  React.useEffect(() => {
    const current = searchParams.get("actor") ?? "";
    if (actor === current) return;
    const timer = window.setTimeout(() => setParams({ actor: actor || null }), 300);
    return () => window.clearTimeout(timer);
  }, [actor, searchParams, setParams]);

  return (
    <>
      <PageHeader
        title="Audit log"
        description="Every create, update and delete recorded server-side. Read-only."
      />

      <div className="flex flex-wrap items-center gap-2">
        <Input
          value={actor}
          onChange={(e) => setActor(e.target.value)}
          placeholder="Filter by user email…"
          className="max-w-xs"
          aria-label="Filter by user"
        />

        <Select
          value={searchParams.get("entity") ?? "all"}
          onValueChange={(v) => setParams({ entity: v })}
        >
          <SelectTrigger className="w-[190px]">
            <SelectValue placeholder="All records" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All record types</SelectItem>
            {entities.map((e) => (
              <SelectItem key={e} value={e}>
                {ENTITY_LABELS[e] ?? e.replace(/_/g, " ")}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={searchParams.get("action") ?? "all"}
          onValueChange={(v) => setParams({ action: v })}
        >
          <SelectTrigger className="w-[150px]">
            <SelectValue placeholder="All actions" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All actions</SelectItem>
            <SelectItem value="create">Create</SelectItem>
            <SelectItem value="update">Update</SelectItem>
            <SelectItem value="delete">Delete</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <TableWrap className="max-h-[calc(100vh-300px)]">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[19%]">When</TableHead>
              <TableHead className="w-[10%]">Action</TableHead>
              <TableHead className="w-[17%]">Record type</TableHead>
              <TableHead className="w-[22%]">User</TableHead>
              <TableHead className="w-[32%]">Change</TableHead>
            </TableRow>
          </TableHeader>

          <TableBody>
            {logs.length === 0 ? (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={5} className="border-b-0">
                  <EmptyState
                    icon={ScrollText}
                    title="No activity recorded"
                    description="Entries appear here as soon as records are created, edited or deleted."
                  />
                </TableCell>
              </TableRow>
            ) : (
              logs.map((log) => (
                <TableRow
                  key={log.id}
                  className="cursor-pointer"
                  onClick={() => setDetail(log)}
                >
                  <TableCell className="text-muted-foreground">
                    {formatDateTime(log.created_at)}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={
                        log.action === "create"
                          ? "success"
                          : log.action === "delete"
                            ? "destructive"
                            : "secondary"
                      }
                    >
                      {log.action}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {ENTITY_LABELS[log.entity_name] ?? log.entity_name.replace(/_/g, " ")}
                  </TableCell>
                  <TableCell className="truncate text-muted-foreground">
                    {log.actor ?? "—"}
                  </TableCell>
                  <TableCell className="truncate text-[12px] text-muted-foreground">
                    {summarize(log)}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </TableWrap>

      <Pagination page={page} pageSize={size} total={total} />

      <Sheet open={Boolean(detail)} onOpenChange={(open) => !open && setDetail(null)}>
        <SheetContent className="sm:max-w-lg">
          {detail && (
            <>
              <SheetHeader>
                <SheetTitle>
                  {detail.action} · {ENTITY_LABELS[detail.entity_name] ?? detail.entity_name}
                </SheetTitle>
                <SheetDescription>
                  {formatDateTime(detail.created_at)} by {detail.actor ?? "unknown"}
                </SheetDescription>
              </SheetHeader>

              <SheetBody className="space-y-4">
                {detail.entity_id && (
                  <div>
                    <p className="text-[12px] font-medium uppercase tracking-wide text-muted-foreground">
                      Record id
                    </p>
                    <p className="tabular mt-0.5 break-all text-[12.5px]">{detail.entity_id}</p>
                  </div>
                )}

                <div>
                  <p className="text-[12px] font-medium uppercase tracking-wide text-muted-foreground">
                    Change detail
                  </p>
                  <pre className="scrollbar-thin mt-1.5 max-h-[60vh] overflow-auto rounded-md border bg-muted/40 p-3 text-[12px] leading-relaxed">
                    {JSON.stringify(detail.diff_json ?? {}, null, 2)}
                  </pre>
                </div>
              </SheetBody>
            </>
          )}
        </SheetContent>
      </Sheet>
    </>
  );
}

function summarize(log: AuditLog) {
  const diff = log.diff_json;
  if (!diff) return "—";

  if ("bulk_import" in diff) {
    const info = diff.bulk_import as { inserted?: number };
    return `Bulk import — ${info.inserted ?? 0} students`;
  }
  if ("source" in diff && diff.source === "offline_sync") {
    const info = diff as { synced?: number };
    return `Offline sync — ${info.synced ?? 0} check-offs`;
  }
  if ("created" in diff) {
    const created = diff.created as Record<string, unknown>;
    return `Created${created?.name ? `: ${created.name}` : ""}`;
  }
  if ("deleted" in diff) {
    const deleted = diff.deleted as Record<string, unknown>;
    return `Deleted${deleted?.name ? `: ${deleted.name}` : ""}`;
  }

  const keys = Object.keys(diff).filter((k) => k !== "source");
  return keys.length ? `Changed ${keys.slice(0, 4).join(", ")}` : "No field changes";
}
