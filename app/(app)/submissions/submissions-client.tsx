"use client";

import * as React from "react";
import { ChevronDown, ChevronLeft, ChevronRight, Filter, GraduationCap, Inbox, School, Search, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableRow,
  TableWrap,
} from "@/components/ui/table";
import { EmptyState, PageHeader } from "@/components/shell/page-header";
import { LocalSortHeader } from "@/components/data-table/local-sort-header";
import { SubmissionReviewSheet } from "./submission-review-sheet";
import { useQueryParams } from "@/hooks/use-query-params";
import { PAGE_SIZE_OPTIONS } from "@/lib/constants";
import { placementLabel } from "@/lib/placement";
import { formatDateTime, parentRelation, studentName } from "@/lib/utils";
import type { Lookups, PublicSubmissionRow, SubmissionStatus } from "@/lib/types";

// Everything is already loaded client-side (up to 500), so bigger pages cost
// nothing — extra options beyond the app-wide 25/50/100 for this table only.
const ROW_OPTIONS = [...PAGE_SIZE_OPTIONS, 200, 500];
// This page's own default — bigger than the app-wide PAGE_SIZE (25) since a
// reviewer working through submissions benefits from seeing more at once,
// and (per the comment above) showing more costs nothing here.
const DEFAULT_PAGE_SIZE = 100;

/** Falls back to the applicant's free-typed institution/course when there's no
 *  matched row yet — placementLabel alone only knows about real standards/courses. */
function institutionLabel(s: PublicSubmissionRow) {
  return s.institutions?.name ?? s.other_institution_name ?? "—";
}
/** A typed-in ("Other") board shows as its text until staff resolve it to a
 *  real one — so a new board is visible straight from the list, not only
 *  after opening that student. Colleges have no board, so "—". */
function boardLabel(s: PublicSubmissionRow) {
  return s.boards?.name ?? s.other_board_name ?? "—";
}
function placementLabelFor(s: PublicSubmissionRow) {
  if (s.standards || s.courses) return placementLabel(s);
  if (s.other_course_name) {
    return `${s.other_course_name} (${s.other_course_structure ?? "—"})`;
  }
  return "—";
}
/** Date and time on two compact lines. The single "21 Sept 2026, 3:46 pm"
 *  string wrapped onto two full-size lines in this narrow column, which made
 *  every row taller than any other cell needed — fewer rows on screen. */
const DATE_FMT = new Intl.DateTimeFormat("en-IN", { dateStyle: "medium" });
const TIME_FMT = new Intl.DateTimeFormat("en-IN", { timeStyle: "short" });
function DateTimeLines({ value }: { value: string }) {
  const d = new Date(value);
  return (
    <>
      <span className="block truncate text-[13px] leading-tight">{DATE_FMT.format(d)}</span>
      <span className="block truncate text-[11px] leading-tight">{TIME_FMT.format(d)}</span>
    </>
  );
}
/** Same "college if there's a course, school otherwise" fallback the review
 *  sheet uses for an unresolved "Other" institution that has no `.type` yet. */
/** Filter identity for an institution: its id, or — for one the applicant
 *  typed in ("Other") — its lowercased name, since those have no id. */
function institutionKey(s: PublicSubmissionRow): string {
  return s.institution_id ?? `other:${institutionLabel(s).toLowerCase()}`;
}

function institutionTypeLabel(s: PublicSubmissionRow): "School" | "College" {
  if (s.institutions) return s.institutions.type === "college" ? "College" : "School";
  return s.course_id || s.other_course_name ? "College" : "School";
}

/** Shared with the review sheet's status badge — one mapping so the two
 *  surfaces can't show a status in different colors. */
export function statusBadgeVariant(status: SubmissionStatus) {
  switch (status) {
    case "approved":
      return "success" as const;
    case "rejected":
      return "destructive" as const;
    case "doubtful":
      return "secondary" as const;
    default:
      return "warning" as const;
  }
}

type SortKey =
  | "code"
  | "applicant"
  | "institution"
  | "board"
  | "institutionType"
  | "placement"
  | "percentage"
  | "grade"
  | "submitted"
  | "status"
  | "reviewedBy";
type SortDir = "asc" | "desc";

const SORT_VALUE: Record<SortKey, (s: PublicSubmissionRow) => string | number> = {
  code: (s) => s.reference_code.toLowerCase(),
  applicant: (s) => studentName(s).toLowerCase(),
  institution: (s) => institutionLabel(s).toLowerCase(),
  board: (s) => (s.boards?.name ?? s.other_board_name ?? "").toLowerCase(),
  institutionType: (s) => institutionTypeLabel(s),
  placement: (s) => placementLabelFor(s).toLowerCase(),
  percentage: (s) => s.percentage ?? -1,
  grade: (s) => (s.grade ?? "").toLowerCase(),
  submitted: (s) => new Date(s.created_at).getTime(),
  status: (s) => s.status,
  reviewedBy: (s) => (s.reviewed_by ?? "").toLowerCase(),
};

export function SubmissionsClient({
  submissions,
  lookups,
  status,
  counts,
}: {
  submissions: PublicSubmissionRow[];
  lookups: Lookups;
  status: SubmissionStatus | "all";
  counts: Record<SubmissionStatus | "all", number>;
}) {
  const { setParams } = useQueryParams();
  const [active, setActive] = React.useState<PublicSubmissionRow | null>(null);
  // Local, immediately-patchable copies of the server props — router.refresh()
  // is a real server round trip (re-run the RPC, re-render, ship the RSC
  // payload back), which has a latency floor no query speedup removes. Since
  // the whole list is already sitting in the browser, a decision patches
  // these directly (see handleDecided) so the table and tab counts update
  // the instant the action resolves; the refresh still runs in the
  // background afterward to reconcile anything this doesn't know about
  // (reviewed_by's exact value, other reviewers' concurrent changes).
  const [localSubmissions, setLocalSubmissions] = React.useState(submissions);
  const [localCounts, setLocalCounts] = React.useState(counts);
  React.useEffect(() => setLocalSubmissions(submissions), [submissions]);
  React.useEffect(() => setLocalCounts(counts), [counts]);

  function handleDecided(id: string, fromStatus: SubmissionStatus, toStatus: SubmissionStatus) {
    setLocalSubmissions((prev) =>
      // A status tab only ever shows rows matching it — a decision that
      // moves a row out of the tab you're viewing removes it from view;
      // "All" keeps every row, so it just updates the badge in place.
      status !== "all" && toStatus !== status
        ? prev.filter((s) => s.id !== id)
        : prev.map((s) => (s.id === id ? { ...s, status: toStatus } : s)),
    );
    setLocalCounts((prev) => ({
      ...prev,
      [fromStatus]: Math.max(0, prev[fromStatus] - 1),
      [toStatus]: prev[toStatus] + 1,
    }));
  }

  const [term, setTerm] = React.useState("");
  const [institutionType, setInstitutionType] = React.useState<"all" | "school" | "college">("all");
  // Empty set = no filter. Holds either standard ids or course ids (they're
  // disjoint UUID sets, so mixing them is safe) — which one depends on
  // institutionType: School shows Standards (Playgroup–12th), College shows
  // degrees/courses, and "all" shows both lists together.
  const [placementIds, setPlacementIds] = React.useState<Set<string>>(new Set());
  // Empty set = no filter. Keys come from institutionKey().
  const [institutionKeys, setInstitutionKeys] = React.useState<Set<string>>(new Set());
  const [institutionSearch, setInstitutionSearch] = React.useState("");

  const [sortKey, setSortKey] = React.useState<SortKey>("submitted");
  const [sortDir, setSortDir] = React.useState<SortDir>("desc");
  const [page, setPage] = React.useState(1);
  const [pageSize, setPageSize] = React.useState<number>(DEFAULT_PAGE_SIZE);

  function togglePlacement(id: string, checked: boolean) {
    setPlacementIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  function toggleInstitution(key: string, checked: boolean) {
    setInstitutionKeys((prev) => {
      const next = new Set(prev);
      if (checked) next.add(key);
      else next.delete(key);
      return next;
    });
  }

  // Institutions to pick from: the ones present in the rows currently loaded
  // (i.e. this tab), narrowed by the institution type — so every option
  // actually returns something. Selections that fall out of this list (a tab
  // switch, a type change) stop applying instead of silently hiding rows.
  const institutionOptions = React.useMemo(() => {
    const map = new Map<string, string>();
    for (const s of localSubmissions) {
      if (institutionType !== "all" && (institutionTypeLabel(s) === "College" ? "college" : "school") !== institutionType) continue;
      map.set(institutionKey(s), institutionLabel(s));
    }
    return [...map.entries()]
      .map(([key, name]) => ({ key, name }))
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
  }, [localSubmissions, institutionType]);
  const activeInstitutionKeys = React.useMemo(
    () => new Set([...institutionKeys].filter((k) => institutionOptions.some((o) => o.key === k))),
    [institutionKeys, institutionOptions],
  );

  function changeInstitutionType(value: "all" | "school" | "college") {
    setInstitutionType(value);
    // Switching to School/College narrows which list the popover shows —
    // drop any selection that belongs to the list that's no longer visible,
    // rather than leaving a filter active with no way to see or undo it.
    if (value === "school") {
      const valid = new Set(lookups.standards.map((s) => s.id));
      setPlacementIds((prev) => new Set([...prev].filter((id) => valid.has(id))));
    } else if (value === "college") {
      const valid = new Set(lookups.courses.map((c) => c.id));
      setPlacementIds((prev) => new Set([...prev].filter((id) => valid.has(id))));
    }
  }

  // Institution type/standard-or-course narrow the working set before free
  // text search runs on top of it — dropdown filters first (exact match),
  // then the token search (partial match) within whatever that leaves.
  const scoped = React.useMemo(() => {
    return localSubmissions.filter((s) => {
      if (institutionType !== "all") {
        const type = institutionTypeLabel(s) === "College" ? "college" : "school";
        if (type !== institutionType) return false;
      }
      if (placementIds.size > 0) {
        const matchesStandard = Boolean(s.standard_id && placementIds.has(s.standard_id));
        const matchesCourse = Boolean(s.course_id && placementIds.has(s.course_id));
        if (!matchesStandard && !matchesCourse) return false;
      }
      if (activeInstitutionKeys.size > 0 && !activeInstitutionKeys.has(institutionKey(s))) return false;
      return true;
    });
  }, [localSubmissions, institutionType, placementIds, activeInstitutionKeys]);

  // One lowercase search string per row, built from the same values the
  // table displays (via the same label helpers), so anything you can see in a
  // row is something you can search for — institution and board included,
  // typed-in "Other" ones too. Email and roll no. aren't columns but were
  // always searchable, so they stay.
  const searchable = React.useMemo(
    () =>
      scoped.map((s) => ({
        s,
        text: [
          s.reference_code,
          studentName(s),
          s.middle_name,
          institutionLabel(s),
          boardLabel(s),
          placementLabelFor(s),
          institutionTypeLabel(s),
          s.percentage !== null ? `${s.percentage}%` : null,
          s.grade,
          formatDateTime(s.created_at),
          s.status,
          s.reviewed_by,
          s.reviewed_at ? formatDateTime(s.reviewed_at) : null,
          s.email,
          s.roll_no,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase(),
      })),
    [scoped],
  );

  // Every word must appear somewhere in the row (in any column, any order),
  // so "vinit shah" or "std 9 gseb" narrow down instead of matching nothing.
  const filtered = React.useMemo(() => {
    const tokens = term.trim().toLowerCase().split(/\s+/).filter(Boolean);
    if (tokens.length === 0) return scoped;
    return searchable.filter(({ text }) => tokens.every((t) => text.includes(t))).map(({ s }) => s);
  }, [scoped, searchable, term]);

  const hasActiveFilters = institutionType !== "all" || placementIds.size > 0 || activeInstitutionKeys.size > 0;
  function clearFilters() {
    setInstitutionType("all");
    setPlacementIds(new Set());
    setInstitutionKeys(new Set());
  }

  const sorted = React.useMemo(() => {
    return [...filtered].sort((a, b) => {
      const av = SORT_VALUE[sortKey](a);
      const bv = SORT_VALUE[sortKey](b);
      const cmp = typeof av === "number" && typeof bv === "number" ? av - bv : String(av).localeCompare(String(bv));
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [filtered, sortKey, sortDir]);

  function toggleSort(key: SortKey) {
    if (key === sortKey) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setSortDir("asc");
    }
  }

  // A tab switch (new `submissions`), a search, a filter change, or a
  // re-sort can all put the previously-viewed page out of range — land back
  // on page 1 rather than showing an empty page the user has to notice and
  // back out of.
  React.useEffect(() => {
    setPage(1);
  }, [localSubmissions, term, institutionType, placementIds, activeInstitutionKeys, sortKey, sortDir]);

  // What the popover filters by depends on the chosen institution type —
  // School shows Standards, College shows degrees/courses, "all" shows both.
  const placementFilterLabel =
    institutionType === "college" ? "Course" : institutionType === "school" ? "Standard" : "Standard / Course";

  const pageCount = Math.max(1, Math.ceil(sorted.length / pageSize));
  const clampedPage = Math.min(page, pageCount);
  const paged = React.useMemo(
    () => sorted.slice((clampedPage - 1) * pageSize, clampedPage * pageSize),
    [sorted, clampedPage, pageSize],
  );

  return (
    <>
      <PageHeader
        title="Submissions"
        description="Applications students submitted themselves via the public form — review before they join the roster."
      />

      <div className="flex flex-wrap items-center gap-3">
        <Tabs value={status} onValueChange={(v) => setParams({ status: v }, { keepAllValue: true })}>
          <TabsList>
            <TabsTrigger value="pending">Pending ({localCounts.pending})</TabsTrigger>
            <TabsTrigger value="approved">Approved ({localCounts.approved})</TabsTrigger>
            <TabsTrigger value="rejected">Rejected ({localCounts.rejected})</TabsTrigger>
            <TabsTrigger value="doubtful">Doubtful ({localCounts.doubtful})</TabsTrigger>
            <TabsTrigger value="all">All ({localCounts.all})</TabsTrigger>
          </TabsList>
        </Tabs>

        <div className="relative ml-auto w-full max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            placeholder="Search any column…"
            className="pl-9 pr-8"
            aria-label="Search submissions"
          />
          {term && (
            <button
              type="button"
              onClick={() => setTerm("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:bg-accent"
              aria-label="Clear search"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-muted/20 px-3 py-2">
        <span className="flex items-center gap-1.5 text-[12px] font-bold uppercase tracking-wide text-muted-foreground">
          <Filter className="h-3.5 w-3.5" />
          Filters
        </span>
        <Select value={institutionType} onValueChange={(v) => changeInstitutionType(v as "all" | "school" | "college")}>
          <SelectTrigger className="w-[170px]">
            <SelectValue placeholder="Institution Type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Institution Type</SelectItem>
            <SelectItem value="school">School</SelectItem>
            <SelectItem value="college">College</SelectItem>
          </SelectContent>
        </Select>

        <Popover>
          <PopoverTrigger asChild>
            <button
              type="button"
              className="flex h-9 w-[170px] items-center justify-between whitespace-nowrap rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm ring-offset-background hover:bg-accent/50 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1"
            >
              <span className="truncate text-left">
                {placementIds.size === 0 ? placementFilterLabel : `${placementIds.size} selected`}
              </span>
              <ChevronDown className="h-4 w-4 shrink-0 opacity-50" />
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-64" align="start">
            <p className="mb-2 text-[13px] font-semibold">{placementFilterLabel}</p>
            <div className="scrollbar-thin max-h-64 space-y-0.5 overflow-y-auto">
              {institutionType !== "college" && (
                <>
                  {institutionType === "all" && lookups.courses.length > 0 && (
                    <p className="px-1.5 pb-0.5 pt-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                      Standards
                    </p>
                  )}
                  {lookups.standards.map((s) => (
                    <label
                      key={s.id}
                      className="flex cursor-pointer items-center gap-2 rounded px-1.5 py-1.5 text-[13px] hover:bg-accent"
                    >
                      <Checkbox
                        checked={placementIds.has(s.id)}
                        onCheckedChange={(v) => togglePlacement(s.id, v === true)}
                      />
                      {s.label}
                    </label>
                  ))}
                </>
              )}
              {institutionType !== "school" && (
                <>
                  {institutionType === "all" && lookups.standards.length > 0 && (
                    <p className="px-1.5 pb-0.5 pt-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                      Courses
                    </p>
                  )}
                  {lookups.courses.map((c) => (
                    <label
                      key={c.id}
                      className="flex cursor-pointer items-center gap-2 rounded px-1.5 py-1.5 text-[13px] hover:bg-accent"
                    >
                      <Checkbox
                        checked={placementIds.has(c.id)}
                        onCheckedChange={(v) => togglePlacement(c.id, v === true)}
                      />
                      {c.name}
                    </label>
                  ))}
                </>
              )}
            </div>
            {placementIds.size > 0 && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="mt-2 w-full"
                onClick={() => setPlacementIds(new Set())}
              >
                Clear
              </Button>
            )}
          </PopoverContent>
        </Popover>

        <Popover onOpenChange={(open) => !open && setInstitutionSearch("")}>
          <PopoverTrigger asChild>
            <button
              type="button"
              className="flex h-9 w-[170px] items-center justify-between whitespace-nowrap rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm ring-offset-background hover:bg-accent/50 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1"
            >
              <span className="truncate text-left">
                {activeInstitutionKeys.size === 0 ? "Institution" : `${activeInstitutionKeys.size} selected`}
              </span>
              <ChevronDown className="h-4 w-4 shrink-0 opacity-50" />
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-72" align="start">
            <p className="mb-2 text-[13px] font-semibold">Institution</p>
            <Input
              value={institutionSearch}
              onChange={(e) => setInstitutionSearch(e.target.value)}
              placeholder="Search institutions…"
              className="mb-2 h-8"
              aria-label="Search institutions"
            />
            <div className="scrollbar-thin max-h-64 space-y-0.5 overflow-y-auto">
              {institutionOptions
                .filter((o) => o.name.toLowerCase().includes(institutionSearch.trim().toLowerCase()))
                .map((o) => (
                  <label
                    key={o.key}
                    className="flex cursor-pointer items-center gap-2 rounded px-1.5 py-1.5 text-[13px] hover:bg-accent"
                  >
                    <Checkbox
                      checked={activeInstitutionKeys.has(o.key)}
                      onCheckedChange={(v) => toggleInstitution(o.key, v === true)}
                    />
                    <span className="truncate" title={o.name}>
                      {o.name}
                    </span>
                  </label>
                ))}
              {institutionOptions.length === 0 && (
                <p className="px-1.5 py-2 text-[13px] text-muted-foreground">No institutions in this view.</p>
              )}
            </div>
            {activeInstitutionKeys.size > 0 && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="mt-2 w-full"
                onClick={() => setInstitutionKeys(new Set())}
              >
                Clear
              </Button>
            )}
          </PopoverContent>
        </Popover>

        {hasActiveFilters && (
          <Button variant="ghost" size="sm" onClick={clearFilters}>
            <X /> Clear filters
          </Button>
        )}
      </div>

      {/* 320px accounted for the page header + one tabs/search row above this
       *  and the pagination bar below it; the Institution Type/Standard
       *  filter row added a second row above the table, so the reserved
       *  space grows to match — otherwise the table claims too much height
       *  and pushes the pagination bar below the fold. */}
      <TableWrap className="max-h-[calc(100vh-380px)]">
        {/* table-fixed: without it, a long institution name grows that column
         *  past its w-[%] hint (table-layout: auto only treats it as a
         *  minimum), pushing every column after it off screen. Fixed layout
         *  makes the widths below load-bearing, so every long value now
         *  needs to truncate within its cell instead of stretching it.
         *  min-w-[1000px] keeps those percentages meaningful instead of
         *  crushing all 10 columns into a phone-width table — TableWrap's
         *  overflow-auto (the app's usual mobile pattern for wide tables)
         *  takes over and scrolls sideways below that width, same as every
         *  other data table in the app. */}
        <Table className="min-w-[1000px] table-fixed">
          <TableHeader>
            <TableRow>
              <LocalSortHeader sortKey="code" current={sortKey} dir={sortDir} onSort={toggleSort} className="h-9 w-[7%]">
                Code
              </LocalSortHeader>
              <LocalSortHeader sortKey="applicant" current={sortKey} dir={sortDir} onSort={toggleSort} className="h-9 w-[12%]">
                Applicant
              </LocalSortHeader>
              <LocalSortHeader sortKey="institution" current={sortKey} dir={sortDir} onSort={toggleSort} className="h-9 w-[16%]">
                Institution
              </LocalSortHeader>
              <LocalSortHeader sortKey="board" current={sortKey} dir={sortDir} onSort={toggleSort} className="h-9 w-[9%]">
                Board
              </LocalSortHeader>
              <LocalSortHeader sortKey="placement" current={sortKey} dir={sortDir} onSort={toggleSort} className="h-9 w-[10%]">
                Std / Course
              </LocalSortHeader>
              <LocalSortHeader
                sortKey="institutionType"
                current={sortKey}
                dir={sortDir}
                onSort={toggleSort}
                className="h-9 w-[6%]"
              >
                Type
              </LocalSortHeader>
              <LocalSortHeader
                sortKey="percentage"
                current={sortKey}
                dir={sortDir}
                onSort={toggleSort}
                className="h-9 w-[5%]"
              >
                %
              </LocalSortHeader>
              <LocalSortHeader sortKey="grade" current={sortKey} dir={sortDir} onSort={toggleSort} className="h-9 w-[5%]">
                Grade
              </LocalSortHeader>
              <LocalSortHeader
                sortKey="submitted"
                current={sortKey}
                dir={sortDir}
                onSort={toggleSort}
                className="h-9 w-[10%]"
              >
                Submitted
              </LocalSortHeader>
              <LocalSortHeader sortKey="status" current={sortKey} dir={sortDir} onSort={toggleSort} className="h-9 w-[8%]">
                Status
              </LocalSortHeader>
              <LocalSortHeader
                sortKey="reviewedBy"
                current={sortKey}
                dir={sortDir}
                onSort={toggleSort}
                className="h-9 w-[12%]"
              >
                Reviewed by
              </LocalSortHeader>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sorted.length === 0 ? (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={11} className="border-b-0">
                  {localSubmissions.length > 0 ? (
                    <EmptyState
                      icon={Inbox}
                      title="Nothing matches these filters"
                      description="Try a different institution, standard or search term."
                    />
                  ) : (
                    <EmptyState
                      icon={Inbox}
                      title="Nothing here"
                      description="Public applications will appear here as students submit them at /apply."
                    />
                  )}
                </TableCell>
              </TableRow>
            ) : (
              paged.map((s) => (
                <TableRow key={s.id} className="cursor-pointer" onClick={() => setActive(s)}>
                  <TableCell className="truncate py-1 font-mono text-[12px] text-muted-foreground">
                    {s.reference_code}
                  </TableCell>
                  <TableCell className="max-w-0 py-1">
                    <span className="block truncate font-medium leading-snug" title={studentName(s)}>
                      {studentName(s)}
                    </span>
                    {s.middle_name && (
                      <span className="block truncate text-[11px] leading-tight text-muted-foreground">
                        {parentRelation(s.salutation)} {s.middle_name}
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="max-w-0 py-1 text-muted-foreground">
                    <span className="block truncate" title={institutionLabel(s)}>
                      {institutionLabel(s)}
                    </span>
                    {s.other_institution_name && !s.institution_id && (
                      <Badge variant="warning" className="mt-0.5">
                        Other
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="max-w-0 py-1 text-muted-foreground">
                    <span className="block truncate" title={boardLabel(s)}>
                      {boardLabel(s)}
                    </span>
                    {s.other_board_name && !s.board_id && (
                      <Badge variant="warning" className="mt-0.5">
                        Other
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="max-w-0 py-1">
                    <Badge variant="secondary" className="block max-w-full truncate" title={placementLabelFor(s)}>
                      {placementLabelFor(s)}
                    </Badge>
                  </TableCell>
                  <TableCell className="py-1">
                    <Badge variant={institutionTypeLabel(s) === "College" ? "default" : "success"}>
                      {institutionTypeLabel(s) === "College" ? (
                        <>
                          <GraduationCap className="h-3 w-3" /> College
                        </>
                      ) : (
                        <>
                          <School className="h-3 w-3" /> School
                        </>
                      )}
                    </Badge>
                  </TableCell>
                  <TableCell className="tabular py-1 text-muted-foreground">
                    {s.percentage !== null ? `${s.percentage}%` : "—"}
                  </TableCell>
                  <TableCell className="truncate py-1 text-muted-foreground">{s.grade || "—"}</TableCell>
                  <TableCell className="py-1 text-muted-foreground">
                    <DateTimeLines value={s.created_at} />
                  </TableCell>
                  <TableCell className="py-1">
                    <Badge variant={statusBadgeVariant(s.status)}>{s.status}</Badge>
                  </TableCell>
                  <TableCell className="max-w-0 py-1 text-muted-foreground">
                    {s.reviewed_by ? (
                      <>
                        <span className="block truncate" title={s.reviewed_by}>
                          {s.reviewed_by}
                        </span>
                        {s.reviewed_at && (
                          <span className="block truncate text-[11px] leading-tight">
                            {formatDateTime(s.reviewed_at)}
                          </span>
                        )}
                      </>
                    ) : (
                      "—"
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </TableWrap>

      <div className="flex flex-wrap items-center justify-between gap-3 py-1">
        <p className="tabular text-[13px] text-muted-foreground">
          {sorted.length === 0
            ? "No records"
            : `${(clampedPage - 1) * pageSize + 1}–${Math.min(clampedPage * pageSize, sorted.length)} of ${sorted.length.toLocaleString("en-IN")}`}
        </p>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="text-[13px] text-muted-foreground">Rows</span>
            <Select
              value={String(pageSize)}
              onValueChange={(v) => {
                setPageSize(Number(v));
                setPage(1);
              }}
            >
              <SelectTrigger className="h-8 w-[74px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ROW_OPTIONS.map((n) => (
                  <SelectItem key={n} value={String(n)}>
                    {n}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="icon-sm"
              aria-label="Previous page"
              disabled={clampedPage <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              <ChevronLeft />
            </Button>
            <span className="tabular px-1 text-[13px] text-muted-foreground">
              {clampedPage} / {pageCount}
            </span>
            <Button
              variant="outline"
              size="icon-sm"
              aria-label="Next page"
              disabled={clampedPage >= pageCount}
              onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
            >
              <ChevronRight />
            </Button>
          </div>
        </div>
      </div>

      <SubmissionReviewSheet
        submission={active}
        lookups={lookups}
        onOpenChange={(open) => !open && setActive(null)}
        onDecided={handleDecided}
      />
    </>
  );
}
