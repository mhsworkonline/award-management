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
  TableHead,
  TableHeader,
  TableRow,
  TableWrap,
} from "@/components/ui/table";
import { EmptyState, PageHeader } from "@/components/shell/page-header";
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

export function SubmissionsClient({
  submissions,
  lookups,
  status,
}: {
  submissions: PublicSubmissionRow[];
  lookups: Lookups;
  status: SubmissionStatus | "all";
}) {
  const { setParams } = useQueryParams();
  const [active, setActive] = React.useState<PublicSubmissionRow | null>(null);
  const [term, setTerm] = React.useState("");

  const filtered = React.useMemo(() => {
    const q = term.trim().toLowerCase();
    if (!q) return submissions;
    return submissions.filter((s) =>
      [s.first_name, s.middle_name, s.last_name, s.reference_code, s.email, s.roll_no]
        .filter(Boolean)
        .some((v) => v!.toLowerCase().includes(q)),
    );
  }, [submissions, term]);

  return (
    <>
      <PageHeader
        title="Submissions"
        description="Applications students submitted themselves via the public form — review before they join the roster."
      />

      <div className="flex flex-wrap items-center gap-3">
        <Tabs value={status} onValueChange={(v) => setParams({ status: v })}>
          <TabsList>
            <TabsTrigger value="pending">Pending</TabsTrigger>
            <TabsTrigger value="approved">Approved</TabsTrigger>
            <TabsTrigger value="rejected">Rejected</TabsTrigger>
            <TabsTrigger value="all">All</TabsTrigger>
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
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[10%]">Code</TableHead>
              <TableHead className="w-[18%]">Applicant</TableHead>
              <TableHead className="w-[20%]">Institution</TableHead>
              <TableHead className="w-[13%]">Std / Course</TableHead>
              <TableHead className="w-[9%]">Roll no</TableHead>
              <TableHead className="w-[8%]">%</TableHead>
              <TableHead className="w-[13%]">Submitted</TableHead>
              <TableHead className="w-[9%]">Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={8} className="border-b-0">
                  <EmptyState
                    icon={Inbox}
                    title="Nothing here"
                    description="Public applications will appear here as students submit them at /apply."
                  />
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((s) => (
                <TableRow key={s.id} className="cursor-pointer" onClick={() => setActive(s)}>
                  <TableCell className="font-mono text-[12px] text-muted-foreground">{s.reference_code}</TableCell>
                  <TableCell>
                    <span className="font-medium">
                      {studentName(s)}
                    </span>
                    {s.middle_name && (
                      <span className="block text-[12px] text-muted-foreground">s/o {s.middle_name}</span>
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    <span className="truncate">{institutionLabel(s)}</span>
                    {s.other_institution_name && !s.institution_id && (
                      <Badge variant="warning" className="ml-1.5">
                        Other
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary">{placementLabelFor(s)}</Badge>
                  </TableCell>
                  <TableCell className="tabular text-muted-foreground">{s.roll_no || "—"}</TableCell>
                  <TableCell className="tabular text-muted-foreground">
                    {s.percentage !== null ? `${s.percentage}%` : "—"}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{formatDateTime(s.created_at)}</TableCell>
                  <TableCell>
                    <Badge
                      variant={
                        s.status === "approved" ? "success" : s.status === "rejected" ? "destructive" : "warning"
                      }
                    >
                      {s.status}
                    </Badge>
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
