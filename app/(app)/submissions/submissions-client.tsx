"use client";

import * as React from "react";
import { Inbox, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
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
import { placementLabel } from "@/lib/placement";
import { formatDateTime, studentName } from "@/lib/utils";
import type { Lookups, PublicSubmissionRow, SubmissionStatus } from "@/lib/types";

/** Falls back to the applicant's free-typed institution/course when there's no
 *  matched row yet — placementLabel alone only knows about real standards/courses. */
function institutionLabel(s: PublicSubmissionRow) {
  return s.institutions?.name ?? s.other_institution_name ?? "—";
}
function placementLabelFor(s: PublicSubmissionRow) {
  if (s.standards || s.courses) return placementLabel(s);
  if (s.other_course_name) {
    return `${s.other_course_name} (${s.other_course_structure ?? "—"})`;
  }
  return "—";
}
/** Same "college if there's a course, school otherwise" fallback the review
 *  sheet uses for an unresolved "Other" institution that has no `.type` yet. */
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
  const [term, setTerm] = React.useState("");
  const [sortKey, setSortKey] = React.useState<SortKey>("submitted");
  const [sortDir, setSortDir] = React.useState<SortDir>("desc");

  const filtered = React.useMemo(() => {
    const q = term.trim().toLowerCase();
    if (!q) return submissions;
    return submissions.filter((s) =>
      [s.first_name, s.middle_name, s.last_name, s.reference_code, s.email, s.roll_no]
        .filter(Boolean)
        .some((v) => v!.toLowerCase().includes(q)),
    );
  }, [submissions, term]);

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

  return (
    <>
      <PageHeader
        title="Submissions"
        description="Applications students submitted themselves via the public form — review before they join the roster."
      />

      <div className="flex flex-wrap items-center gap-3">
        <Tabs value={status} onValueChange={(v) => setParams({ status: v }, { keepAllValue: true })}>
          <TabsList>
            <TabsTrigger value="pending">Pending ({counts.pending})</TabsTrigger>
            <TabsTrigger value="approved">Approved ({counts.approved})</TabsTrigger>
            <TabsTrigger value="rejected">Rejected ({counts.rejected})</TabsTrigger>
            <TabsTrigger value="doubtful">Doubtful ({counts.doubtful})</TabsTrigger>
            <TabsTrigger value="all">All ({counts.all})</TabsTrigger>
          </TabsList>
        </Tabs>

        <div className="relative ml-auto w-full max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            placeholder="Search name, code, email…"
            className="pl-9"
            aria-label="Search submissions"
          />
        </div>
      </div>

      <TableWrap className="max-h-[calc(100vh-320px)]">
        {/* table-fixed: without it, a long institution name grows that column
         *  past its w-[%] hint (table-layout: auto only treats it as a
         *  minimum), pushing every column after it off screen. Fixed layout
         *  makes the widths below load-bearing, so every long value now
         *  needs to truncate within its cell instead of stretching it. */}
        <Table className="table-fixed">
          <TableHeader>
            <TableRow>
              <LocalSortHeader sortKey="code" current={sortKey} dir={sortDir} onSort={toggleSort} className="h-9 w-[8%]">
                Code
              </LocalSortHeader>
              <LocalSortHeader sortKey="applicant" current={sortKey} dir={sortDir} onSort={toggleSort} className="h-9 w-[13%]">
                Applicant
              </LocalSortHeader>
              <LocalSortHeader sortKey="institution" current={sortKey} dir={sortDir} onSort={toggleSort} className="h-9 w-[17%]">
                Institution
              </LocalSortHeader>
              <LocalSortHeader sortKey="placement" current={sortKey} dir={sortDir} onSort={toggleSort} className="h-9 w-[10%]">
                Std / Course
              </LocalSortHeader>
              <LocalSortHeader
                sortKey="institutionType"
                current={sortKey}
                dir={sortDir}
                onSort={toggleSort}
                className="h-9 w-[7%]"
              >
                Type
              </LocalSortHeader>
              <LocalSortHeader
                sortKey="percentage"
                current={sortKey}
                dir={sortDir}
                onSort={toggleSort}
                className="h-9 w-[6%]"
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
              <LocalSortHeader sortKey="status" current={sortKey} dir={sortDir} onSort={toggleSort} className="h-9 w-[9%]">
                Status
              </LocalSortHeader>
              <LocalSortHeader
                sortKey="reviewedBy"
                current={sortKey}
                dir={sortDir}
                onSort={toggleSort}
                className="h-9 w-[15%]"
              >
                Reviewed by
              </LocalSortHeader>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sorted.length === 0 ? (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={10} className="border-b-0">
                  <EmptyState
                    icon={Inbox}
                    title="Nothing here"
                    description="Public applications will appear here as students submit them at /apply."
                  />
                </TableCell>
              </TableRow>
            ) : (
              sorted.map((s) => (
                <TableRow key={s.id} className="cursor-pointer" onClick={() => setActive(s)}>
                  <TableCell className="truncate py-1.5 font-mono text-[12px] text-muted-foreground">
                    {s.reference_code}
                  </TableCell>
                  <TableCell className="max-w-0 py-1.5">
                    <span className="block truncate font-medium" title={studentName(s)}>
                      {studentName(s)}
                    </span>
                    {s.middle_name && (
                      <span className="block truncate text-[11px] leading-tight text-muted-foreground">
                        s/o {s.middle_name}
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="max-w-0 py-1.5 text-muted-foreground">
                    <span className="block truncate" title={institutionLabel(s)}>
                      {institutionLabel(s)}
                    </span>
                    {s.other_institution_name && !s.institution_id && (
                      <Badge variant="warning" className="mt-0.5">
                        Other
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="max-w-0 py-1.5">
                    <Badge variant="secondary" className="block max-w-full truncate" title={placementLabelFor(s)}>
                      {placementLabelFor(s)}
                    </Badge>
                  </TableCell>
                  <TableCell className="py-1.5 text-muted-foreground">{institutionTypeLabel(s)}</TableCell>
                  <TableCell className="tabular py-1.5 text-muted-foreground">
                    {s.percentage !== null ? `${s.percentage}%` : "—"}
                  </TableCell>
                  <TableCell className="truncate py-1.5 text-muted-foreground">{s.grade || "—"}</TableCell>
                  <TableCell className="py-1.5 text-muted-foreground">{formatDateTime(s.created_at)}</TableCell>
                  <TableCell className="py-1.5">
                    <Badge variant={statusBadgeVariant(s.status)}>{s.status}</Badge>
                  </TableCell>
                  <TableCell className="max-w-0 py-1.5 text-muted-foreground">
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

      <SubmissionReviewSheet submission={active} lookups={lookups} onOpenChange={(open) => !open && setActive(null)} />
    </>
  );
}
