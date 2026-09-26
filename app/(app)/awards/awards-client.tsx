"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Award, Filter, Gift, MoreHorizontal, Plus, Trash2, X } from "lucide-react";
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
import { MultiSelectFilter } from "@/components/data-table/multi-select-filter";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ConfirmDialog } from "@/components/form/confirm-dialog";
import { AwardSheet } from "./award-sheet";
import { AssignAwardsButton } from "./assign-awards-button";
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

  // The Awarded tab's list is loaded whole, so it filters in the browser with the
  // strip below (like Submissions); the Not-yet-awarded tab is paginated on the
  // server, so it keeps the URL-driven advanced filters.
  const advancedFilters: FilterKey[] =
    view === "awarded"
      ? []
      : !includeAwarded
        ? ["institution_id", "institution_type", "standard_id", "stream_id"]
        : ["institution_id", "institution_type", "standard_id", "stream_id", "award_category_id"];
  const [allocating, setAllocating] = React.useState<AwardRow | null>(null);
  const [pendingDelete, setPendingDelete] = React.useState<AwardRow | null>(null);

  // ---- Awarded tab filters (all in the browser; empty set / "all" = no filter)
  const [typeFilter, setTypeFilter] = React.useState<"all" | "school" | "college">("all");
  const [institutionIds, setInstitutionIds] = React.useState<Set<string>>(new Set());
  const [placementIds, setPlacementIds] = React.useState<Set<string>>(new Set()); // standard or course ids
  const [streamIds, setStreamIds] = React.useState<Set<string>>(new Set());
  const [categoryIds, setCategoryIds] = React.useState<Set<string>>(new Set());
  const [giftFilter, setGiftFilter] = React.useState<"all" | "none" | "allocated" | "distributed" | "pending">("all");

  // Options come from the awards actually loaded, so every choice returns rows.
  const institutionOptions = React.useMemo(() => {
    const map = new Map<string, string>();
    for (const r of rows) {
      if ((typeFilter === "all" || r.institution_type === typeFilter) && r.institution_id) {
        map.set(r.institution_id, r.institution_name);
      }
    }
    return [...map.entries()]
      .map(([value, label]) => ({ value, label }))
      .sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: "base" }));
  }, [rows, typeFilter]);
  const placementOptions = React.useMemo(() => {
    const present = new Set<string>();
    for (const r of rows) {
      if (typeFilter !== "all" && r.institution_type !== typeFilter) continue;
      if (r.standard_id) present.add(r.standard_id);
      if (r.course_id) present.add(r.course_id);
    }
    return [
      ...lookups.standards.filter((x) => present.has(x.id)).map((x) => ({ value: x.id, label: x.label })),
      ...lookups.courses.filter((x) => present.has(x.id)).map((x) => ({ value: x.id, label: x.name })),
    ];
  }, [rows, typeFilter, lookups.standards, lookups.courses]);
  const streamOptions = React.useMemo(() => {
    const present = new Set(rows.map((r) => r.stream_id).filter((x): x is string => !!x));
    return lookups.streams.filter((x) => present.has(x.id)).map((x) => ({ value: x.id, label: x.name }));
  }, [rows, lookups.streams]);
  const categoryOptions = React.useMemo(() => {
    const present = new Set(rows.map((r) => r.category_id).filter((x): x is string => !!x));
    return lookups.awardCategories.filter((x) => present.has(x.id)).map((x) => ({ value: x.id, label: x.name }));
  }, [rows, lookups.awardCategories]);

  // A pick that no longer exists (another year, another type) stops applying
  // rather than silently hiding rows with no way to see why.
  const stillValid = (set: Set<string>, options: { value: string }[]) =>
    new Set([...set].filter((v) => options.some((o) => o.value === v)));
  const activeInstitutions = stillValid(institutionIds, institutionOptions);
  const activePlacements = stillValid(placementIds, placementOptions);
  const activeStreams = stillValid(streamIds, streamOptions);
  const activeCategories = stillValid(categoryIds, categoryOptions);

  const filteredRows = rows.filter((r) => {
    if (typeFilter !== "all" && r.institution_type !== typeFilter) return false;
    if (activeInstitutions.size > 0 && !(r.institution_id && activeInstitutions.has(r.institution_id))) return false;
    if (
      activePlacements.size > 0 &&
      !((r.standard_id && activePlacements.has(r.standard_id)) || (r.course_id && activePlacements.has(r.course_id)))
    ) {
      return false;
    }
    if (activeStreams.size > 0 && !(r.stream_id && activeStreams.has(r.stream_id))) return false;
    if (activeCategories.size > 0 && !(r.category_id && activeCategories.has(r.category_id))) return false;
    if (giftFilter === "none" && r.allocations.length > 0) return false;
    if (giftFilter === "allocated" && r.allocations.length === 0) return false;
    if (giftFilter === "distributed" && !r.allocations.some((a) => a.distribution_status === "distributed")) return false;
    if (giftFilter === "pending" && !r.allocations.some((a) => a.distribution_status !== "distributed")) return false;
    return true;
  });
  const hasActiveFilters =
    typeFilter !== "all" ||
    activeInstitutions.size > 0 ||
    activePlacements.size > 0 ||
    activeStreams.size > 0 ||
    activeCategories.size > 0 ||
    giftFilter !== "all";
  function clearFilters() {
    setTypeFilter("all");
    setInstitutionIds(new Set());
    setPlacementIds(new Set());
    setStreamIds(new Set());
    setCategoryIds(new Set());
    setGiftFilter("all");
  }

  const withoutGift = filteredRows.filter((r) => r.allocations.length === 0).length;

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
    return [...filteredRows].sort((a, b) => {
      const av = AWARD_SORT_VALUE[awardSortKey](a);
      const bv = AWARD_SORT_VALUE[awardSortKey](b);
      const cmp = typeof av === "number" && typeof bv === "number" ? av - bv : String(av).localeCompare(String(bv));
      return awardSortDir === "asc" ? cmp : -cmp;
    });
  }, [filteredRows, awardSortKey, awardSortDir]);

  return (
    <>
      <PageHeader
        title="Awards"
        description="Assign merit awards, then allocate a gift against each one."
        actions={
          canCreate && (
            <>
              {canUpdate && canDelete && (
                <AssignAwardsButton
                  yearId={defaultYearId}
                  yearLabel={lookups.academicYears.find((y) => y.id === defaultYearId)?.label ?? "this year"}
                />
              )}
              <Button onClick={() => setAssignOpen(true)}>
                <Plus /> Assign award
              </Button>
            </>
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

      {view === "awarded" && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-muted/20 px-3 py-2">
          <span className="flex items-center gap-1.5 text-[12px] font-bold uppercase tracking-wide text-muted-foreground">
            <Filter className="h-3.5 w-3.5" />
            Filters
          </span>
          <Select value={typeFilter} onValueChange={(v) => setTypeFilter(v as "all" | "school" | "college")}>
            <SelectTrigger className="w-[170px]" aria-label="Institution type">
              <SelectValue placeholder="Institution Type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Institution Type</SelectItem>
              <SelectItem value="school">School</SelectItem>
              <SelectItem value="college">College</SelectItem>
            </SelectContent>
          </Select>
          <MultiSelectFilter label="Institution" options={institutionOptions} selected={activeInstitutions} onChange={setInstitutionIds} searchable />
          <MultiSelectFilter label="Standard / Course" options={placementOptions} selected={activePlacements} onChange={setPlacementIds} />
          {streamOptions.length > 0 && (
            <MultiSelectFilter label="Stream" options={streamOptions} selected={activeStreams} onChange={setStreamIds} />
          )}
          <MultiSelectFilter label="Award" options={categoryOptions} selected={activeCategories} onChange={setCategoryIds} />
          <Select value={giftFilter} onValueChange={(v) => setGiftFilter(v as typeof giftFilter)}>
            <SelectTrigger className="w-[170px]" aria-label="Gift status">
              <SelectValue placeholder="Gift" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Gift status</SelectItem>
              <SelectItem value="none">No gift yet</SelectItem>
              <SelectItem value="allocated">Gift allocated</SelectItem>
              <SelectItem value="distributed">Distributed</SelectItem>
              <SelectItem value="pending">Not yet distributed</SelectItem>
            </SelectContent>
          </Select>
          {hasActiveFilters && (
            <Button variant="ghost" size="sm" onClick={clearFilters}>
              <X /> Clear filters
            </Button>
          )}
          <span className="ml-auto text-[12px] text-muted-foreground">
            {filteredRows.length === rows.length
              ? `${rows.length} award${rows.length === 1 ? "" : "s"}`
              : `${filteredRows.length} of ${rows.length} awards`}
          </span>
        </div>
      )}

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
              <LocalSortHeader sortKey="student" current={awardSortKey} dir={awardSortDir} onSort={toggleAwardSort} className="w-[20%]">
                Student
              </LocalSortHeader>
              <LocalSortHeader sortKey="institution" current={awardSortKey} dir={awardSortDir} onSort={toggleAwardSort} className="w-[19%]">
                Institution
              </LocalSortHeader>
              <LocalSortHeader sortKey="placement" current={awardSortKey} dir={awardSortDir} onSort={toggleAwardSort} className="w-[12%]">
                Std / Course
              </LocalSortHeader>
              <LocalSortHeader sortKey="category" current={awardSortKey} dir={awardSortDir} onSort={toggleAwardSort} className="w-[12%]">
                Award
              </LocalSortHeader>
              <LocalSortHeader sortKey="subject" current={awardSortKey} dir={awardSortDir} onSort={toggleAwardSort} className="w-[13%]">
                Subject / criteria
              </LocalSortHeader>
              <LocalSortHeader sortKey="gift" current={awardSortKey} dir={awardSortDir} onSort={toggleAwardSort} className="w-[20%]">
                Gift
              </LocalSortHeader>
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
