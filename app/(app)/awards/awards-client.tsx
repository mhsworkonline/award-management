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
import { FilterBar, type FilterKey } from "@/components/data-table/filter-bar";
import { LocalSortHeader } from "@/components/data-table/local-sort-header";
import { Pagination } from "@/components/data-table/pagination";
import { SortHeader } from "@/components/data-table/sort-header";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ConfirmDialog } from "@/components/form/confirm-dialog";
import { AwardSheet } from "./award-sheet";
import { AllocateSheet } from "./allocate-sheet";
import { SuggestedPerformers } from "./suggested-performers";
import { deleteAward } from "@/lib/actions/awards";
import type { RecordOption } from "@/lib/actions/search";
import { useQueryParams } from "@/hooks/use-query-params";
import { placementLabel } from "@/lib/placement";
import { parentRelation } from "@/lib/utils";
import { usePermissions } from "@/components/providers/permissions-provider";
import type { AwardRow } from "@/lib/data/awards";
import type { listTopPerformers } from "@/lib/data/academic-records";
import type { AcademicRecordRow, Lookups } from "@/lib/types";

type Candidates = { rows: AcademicRecordRow[]; total: number; page: number; size: number };

type AwardSortKey = "student" | "institution" | "placement" | "category" | "subject" | "gift";

const AWARD_SORT_VALUE: Record<AwardSortKey, (r: AwardRow) => string | number> = {
  student: (r) => r.student_name.toLowerCase(),
  institution: (r) => r.institution_name.toLowerCase(),
  placement: (r) => r.placement.toLowerCase(),
  category: (r) => r.category_name.toLowerCase(),
  subject: (r) => (r.subject_or_criteria ?? "").toLowerCase(),
  gift: (r) => (r.allocations[0]?.gift_name ?? "").toLowerCase(),
};

export function AwardsClient({
  view,
  rows,
  performers,
  candidates,
  includeAwarded,
  lookups,
  defaultYearId,
}: {
  view: "awarded" | "candidates";
  rows: AwardRow[];
  performers: Awaited<ReturnType<typeof listTopPerformers>>;
  candidates: Candidates | null;
  includeAwarded: boolean;
  lookups: Lookups;
  defaultYearId: string | null;
}) {
  const router = useRouter();
  const { setParams } = useQueryParams();
  const { can } = usePermissions();
  const canCreate = can("awards", "create");
  const canUpdate = can("awards", "update");
  const canDelete = can("awards", "delete");
  const canManageGifts = canCreate || canUpdate || canDelete;
  const [assignOpen, setAssignOpen] = React.useState(false);
  // Set when "Assign award" is clicked on a student's own row — the sheet then
  // opens with that student already chosen.
  const [assignFor, setAssignFor] = React.useState<RecordOption | null>(null);

  const advancedFilters: FilterKey[] =
    view === "candidates" && !includeAwarded
      ? ["institution_id", "institution_type", "standard_id", "stream_id"]
      : ["institution_id", "institution_type", "standard_id", "stream_id", "award_category_id"];
  const [allocating, setAllocating] = React.useState<AwardRow | null>(null);
  const [pendingDelete, setPendingDelete] = React.useState<AwardRow | null>(null);

  const withoutGift = rows.filter((r) => r.allocations.length === 0).length;

  // The Awarded table isn't paginated — `rows` is the complete, already-
  // filtered result — so every column sorts client-side, same pattern as
  // Submissions. (The candidates table below is server-paginated instead,
  // so its sortable columns use SortHeader/the URL, not this.)
  const [awardSortKey, setAwardSortKey] = React.useState<AwardSortKey>("student");
  const [awardSortDir, setAwardSortDir] = React.useState<"asc" | "desc">("asc");
  function toggleAwardSort(key: AwardSortKey) {
    if (key === awardSortKey) setAwardSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setAwardSortKey(key);
      setAwardSortDir("asc");
    }
  }
  const sortedRows = React.useMemo(() => {
    return [...rows].sort((a, b) => {
      const av = AWARD_SORT_VALUE[awardSortKey](a);
      const bv = AWARD_SORT_VALUE[awardSortKey](b);
      const cmp = typeof av === "number" && typeof bv === "number" ? av - bv : String(av).localeCompare(String(bv));
      return awardSortDir === "asc" ? cmp : -cmp;
    });
  }, [rows, awardSortKey, awardSortDir]);

  return (
    <>
      <PageHeader
        title="Awards"
        description="Assign merit awards, then allocate a gift against each one."
        actions={
          canCreate && (
            <Button onClick={() => setAssignOpen(true)}>
              <Plus /> Assign award
            </Button>
          )
        }
      />

      <Tabs
        value={view}
        onValueChange={(v) => setParams({ view: v === "candidates" ? null : v, include_awarded: null })}
      >
        <TabsList>
          <TabsTrigger value="candidates">Not yet awarded</TabsTrigger>
          <TabsTrigger value="awarded">Awarded</TabsTrigger>
        </TabsList>
      </Tabs>

      <FilterBar
        lookups={lookups}
        advanced={advancedFilters}
        searchPlaceholder={view === "awarded" ? "Search awarded student…" : "Search student name or roll no…"}
      >
        {view === "awarded" && withoutGift > 0 && (
          <Badge variant="warning">
            {withoutGift} award{withoutGift === 1 ? "" : "s"} without a gift
          </Badge>
        )}
      </FilterBar>

      {view === "candidates" && candidates && (
        <>
          <label className="flex w-fit cursor-pointer items-center gap-2 text-[13px] text-muted-foreground">
            <Checkbox
              checked={includeAwarded}
              onCheckedChange={(c) => setParams({ include_awarded: c === true ? "1" : null })}
            />
            Also show students who already have an award
          </label>

          <TableWrap className="max-h-[calc(100vh-340px)]">
            {/* table-fixed needs min-w so the percentages stay meaningful and
             *  TableWrap scrolls sideways on a phone instead of crushing them. */}
            <Table className="min-w-[860px] table-fixed">
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[22%]">
                    <SortHeader column="student">Student</SortHeader>
                  </TableHead>
                  <TableHead className="w-[22%]">
                    <SortHeader column="institution">Institution</SortHeader>
                  </TableHead>
                  {/* Not sortable: a school record's Standard and a college
                   *  record's Course live in different columns on different
                   *  tables — there's no single column to order the mix by. */}
                  <TableHead className="w-[14%]">Std / Course</TableHead>
                  <TableHead className="w-[8%]">
                    <SortHeader column="percentage">%</SortHeader>
                  </TableHead>
                  <TableHead className="w-[8%]">
                    <SortHeader column="grade">Grade</SortHeader>
                  </TableHead>
                  {/* Not sortable: a count over a related table, not a column
                   *  on this one. */}
                  <TableHead className="w-[14%]">Awards</TableHead>
                  <TableHead className="w-[12%]">
                    <span className="sr-only">Assign</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {candidates.rows.length === 0 ? (
                  <TableRow className="hover:bg-transparent">
                    <TableCell colSpan={7} className="border-b-0">
                      <EmptyState
                        icon={Award}
                        title={includeAwarded ? "No students match" : "Nobody left without an award"}
                        description={
                          includeAwarded
                            ? "No students have a record for this year with these filters."
                            : "Every student matching these filters already has an award — or none have a record for this year yet."
                        }
                      />
                    </TableCell>
                  </TableRow>
                ) : (
                  candidates.rows.map((row) => {
                    const student = row.students;
                    const awardNames = (row.student_awards ?? []).map((a) => a.award_categories?.name ?? "Award");
                    return (
                      <TableRow key={row.id}>
                        <TableCell className="max-w-0">
                          <span className="block truncate font-medium" title={student ? `${student.first_name} ${student.last_name}` : ""}>
                            {student ? `${student.first_name} ${student.last_name}` : "—"}
                          </span>
                          {student?.middle_name && (
                            <span className="block truncate text-[12px] text-muted-foreground">
                              {parentRelation(student.salutation)} {student.middle_name}
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="max-w-0 text-muted-foreground">
                          <span className="block truncate" title={row.institutions?.name ?? ""}>
                            {row.institutions?.name ?? "—"}
                          </span>
                        </TableCell>
                        <TableCell className="max-w-0">
                          <Badge variant="secondary" className="block max-w-full truncate" title={placementLabel(row)}>
                            {placementLabel(row)}
                          </Badge>
                        </TableCell>
                        <TableCell className="tabular text-muted-foreground">
                          {row.percentage !== null ? `${row.percentage}%` : "—"}
                        </TableCell>
                        <TableCell className="truncate text-muted-foreground">{row.grade || "—"}</TableCell>
                        <TableCell>
                          {awardNames.length === 0 ? (
                            <span className="text-muted-foreground">—</span>
                          ) : (
                            <span className="flex flex-wrap gap-1">
                              {awardNames.map((n, i) => (
                                <Badge key={i}>{n}</Badge>
                              ))}
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          {canCreate && student && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() =>
                                setAssignFor({
                                  academic_record_id: row.id,
                                  student_name: `${student.first_name} ${student.last_name}`,
                                  father_name: student.middle_name,
                                  student_salutation: student.salutation,
                                  institution_name: row.institutions?.name ?? "—",
                                  placement: placementLabel(row),
                                })
                              }
                            >
                              <Award /> Assign award
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </TableWrap>

          <Pagination page={candidates.page} pageSize={candidates.size} total={candidates.total} />
        </>
      )}

      {view === "awarded" && <SuggestedPerformers performers={performers} lookups={lookups} />}

      {view === "awarded" && (
      <TableWrap className="max-h-[calc(100vh-300px)]">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[20%]">
                <LocalSortHeader sortKey="student" current={awardSortKey} dir={awardSortDir} onSort={toggleAwardSort}>
                  Student
                </LocalSortHeader>
              </TableHead>
              <TableHead className="w-[19%]">
                <LocalSortHeader sortKey="institution" current={awardSortKey} dir={awardSortDir} onSort={toggleAwardSort}>
                  Institution
                </LocalSortHeader>
              </TableHead>
              <TableHead className="w-[12%]">
                <LocalSortHeader sortKey="placement" current={awardSortKey} dir={awardSortDir} onSort={toggleAwardSort}>
                  Std / Course
                </LocalSortHeader>
              </TableHead>
              <TableHead className="w-[12%]">
                <LocalSortHeader sortKey="category" current={awardSortKey} dir={awardSortDir} onSort={toggleAwardSort}>
                  Award
                </LocalSortHeader>
              </TableHead>
              <TableHead className="w-[13%]">
                <LocalSortHeader sortKey="subject" current={awardSortKey} dir={awardSortDir} onSort={toggleAwardSort}>
                  Subject / criteria
                </LocalSortHeader>
              </TableHead>
              <TableHead className="w-[20%]">
                <LocalSortHeader sortKey="gift" current={awardSortKey} dir={awardSortDir} onSort={toggleAwardSort}>
                  Gift
                </LocalSortHeader>
              </TableHead>
              <TableHead className="w-[4%] text-right">
                <span className="sr-only">Actions</span>
              </TableHead>
            </TableRow>
          </TableHeader>

          <TableBody>
            {sortedRows.length === 0 ? (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={7} className="border-b-0">
                  <EmptyState
                    icon={Award}
                    title="No awards assigned"
                    description="Assign award categories to students, then allocate the gift each winner receives."
                    action={
                      canCreate && (
                        <Button onClick={() => setAssignOpen(true)}>
                          <Plus /> Assign award
                        </Button>
                      )
                    }
                  />
                </TableCell>
              </TableRow>
            ) : (
              sortedRows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell>
                    <span className="font-medium">{row.student_name}</span>
                    {row.father_name && (
                      <span className="block text-[12px] text-muted-foreground">
                        {parentRelation(row.student_salutation)} {row.father_name}
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
                      canCreate && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setAllocating(row)}
                        >
                          <Gift /> Allocate
                        </Button>
                      )
                    ) : canManageGifts ? (
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
                    ) : (
                      <span className="flex flex-wrap gap-1">
                        {row.allocations.map((a) => (
                          <Badge
                            key={a.id}
                            variant={a.distribution_status === "distributed" ? "success" : "warning"}
                          >
                            {a.gift_name}
                            {a.quantity > 1 ? ` ×${a.quantity}` : ""}
                          </Badge>
                        ))}
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    {(canManageGifts || canDelete) && (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon-sm" aria-label="Row actions">
                            <MoreHorizontal />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          {canManageGifts && (
                            <DropdownMenuItem onClick={() => setAllocating(row)}>
                              <Gift /> Manage gifts
                            </DropdownMenuItem>
                          )}
                          {canDelete && (
                            <DropdownMenuItem destructive onClick={() => setPendingDelete(row)}>
                              <Trash2 /> Remove award
                            </DropdownMenuItem>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </TableWrap>
      )}

      <AwardSheet
        open={assignOpen || Boolean(assignFor)}
        onOpenChange={(open) => {
          if (!open) {
            setAssignOpen(false);
            setAssignFor(null);
          }
        }}
        lookups={lookups}
        defaultYearId={defaultYearId}
        preselected={assignFor}
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
