"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Award, Gift, MoreHorizontal, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import { ConfirmDialog } from "@/components/form/confirm-dialog";
import { AwardSheet } from "./award-sheet";
import { AllocateSheet } from "./allocate-sheet";
import { SuggestedPerformers } from "./suggested-performers";
import { deleteAward } from "@/lib/actions/awards";
import type { AwardRow } from "@/lib/data/awards";
import type { listTopPerformers } from "@/lib/data/academic-records";
import type { Lookups } from "@/lib/types";

export function AwardsClient({
  rows,
  performers,
  lookups,
  defaultYearId,
}: {
  rows: AwardRow[];
  performers: Awaited<ReturnType<typeof listTopPerformers>>;
  lookups: Lookups;
  defaultYearId: string | null;
}) {
  const router = useRouter();
  const [assignOpen, setAssignOpen] = React.useState(false);
  const [allocating, setAllocating] = React.useState<AwardRow | null>(null);
  const [pendingDelete, setPendingDelete] = React.useState<AwardRow | null>(null);

  const withoutGift = rows.filter((r) => r.allocations.length === 0).length;

  return (
    <>
      <PageHeader
        title="Awards"
        description="Assign merit awards, then allocate a gift against each one."
        actions={
          <Button onClick={() => setAssignOpen(true)}>
            <Plus /> Assign award
          </Button>
        }
      />

      <FilterBar
        lookups={lookups}
        advanced={["institution_id", "award_category_id"]}
        searchPlaceholder="Search awarded student…"
      >
        {withoutGift > 0 && (
          <Badge variant="warning">
            {withoutGift} award{withoutGift === 1 ? "" : "s"} without a gift
          </Badge>
        )}
      </FilterBar>

      <SuggestedPerformers performers={performers} lookups={lookups} />

      <TableWrap className="max-h-[calc(100vh-300px)]">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[20%]">Student</TableHead>
              <TableHead className="w-[19%]">Institution</TableHead>
              <TableHead className="w-[12%]">Std / Course</TableHead>
              <TableHead className="w-[12%]">Award</TableHead>
              <TableHead className="w-[13%]">Subject / criteria</TableHead>
              <TableHead className="w-[20%]">Gift</TableHead>
              <TableHead className="w-[4%] text-right">
                <span className="sr-only">Actions</span>
              </TableHead>
            </TableRow>
          </TableHeader>

          <TableBody>
            {rows.length === 0 ? (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={7} className="border-b-0">
                  <EmptyState
                    icon={Award}
                    title="No awards assigned"
                    description="Assign award categories to students, then allocate the gift each winner receives."
                    action={
                      <Button onClick={() => setAssignOpen(true)}>
                        <Plus /> Assign award
                      </Button>
                    }
                  />
                </TableCell>
              </TableRow>
            ) : (
              rows.map((row) => (
                <TableRow key={row.id}>
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
                    <Badge>{row.category_name}</Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {row.subject_or_criteria || "—"}
                  </TableCell>
                  <TableCell>
                    {row.allocations.length === 0 ? (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setAllocating(row)}
                      >
                        <Gift /> Allocate
                      </Button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setAllocating(row)}
                        className="flex flex-wrap gap-1 rounded text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        {row.allocations.map((a) => (
                          <Badge
                            key={a.id}
                            variant={a.distribution_status === "distributed" ? "success" : "warning"}
                          >
                            {a.gift_name}
                            {a.quantity > 1 ? ` ×${a.quantity}` : ""}
                          </Badge>
                        ))}
                      </button>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon-sm" aria-label="Row actions">
                          <MoreHorizontal />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => setAllocating(row)}>
                          <Gift /> Manage gifts
                        </DropdownMenuItem>
                        <DropdownMenuItem destructive onClick={() => setPendingDelete(row)}>
                          <Trash2 /> Remove award
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </TableWrap>

      <AwardSheet
        open={assignOpen}
        onOpenChange={setAssignOpen}
        lookups={lookups}
        defaultYearId={defaultYearId}
      />

      <AllocateSheet
        award={allocating}
        onOpenChange={(open) => !open && setAllocating(null)}
        lookups={lookups}
      />

      <ConfirmDialog
        open={Boolean(pendingDelete)}
        onOpenChange={(open) => !open && setPendingDelete(null)}
        title="Remove this award?"
        description={`${pendingDelete?.student_name}'s ${pendingDelete?.category_name} award and any gift allocated to it will be removed. Allocated stock returns to inventory.`}
        confirmLabel="Remove award"
        onConfirm={async () => {
          const result = await deleteAward(pendingDelete!.id);
          if (result.ok) router.refresh();
          return result;
        }}
      />
    </>
  );
}
