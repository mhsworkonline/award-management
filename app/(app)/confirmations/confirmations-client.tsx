"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, MessageSquareText, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableWrap,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { EmptyState, PageHeader } from "@/components/shell/page-header";
import { ConfirmDialog } from "@/components/form/confirm-dialog";
import { SubmissionReviewSheet } from "../submissions/submission-review-sheet";
import { deleteDataConfirmation, getConfirmationSubmission } from "@/lib/actions/confirmations";
import { formatDateTime } from "@/lib/utils";
import { usePermissions } from "@/components/providers/permissions-provider";
import type { ConfirmationRow } from "@/lib/data/confirmations";
import type { Lookups, PublicSubmissionRow } from "@/lib/types";

/** What a student sent in via /confirm, for staff to read and act on.
 *  Clicking a row opens the exact same Review Application sheet
 *  /submissions uses (see getConfirmationSubmission) — every confirmation
 *  traces back to the approved submission that created its student/
 *  academic record, and that sheet already edits an approved submission
 *  safely (syncing the correction into the live roster — see
 *  updateSubmission), so this reuses it as-is rather than a separate view. */
export function ConfirmationsClient({ rows, lookups }: { rows: ConfirmationRow[]; lookups: Lookups }) {
  const router = useRouter();
  const { can } = usePermissions();
  const canDelete = can("submissions", "delete");
  const [term, setTerm] = React.useState("");
  const [pendingDelete, setPendingDelete] = React.useState<ConfirmationRow | null>(null);

  const [loadingId, setLoadingId] = React.useState<string | null>(null);
  const [active, setActive] = React.useState<PublicSubmissionRow | null>(null);

  async function openRow(r: ConfirmationRow) {
    setLoadingId(r.id);
    const result = await getConfirmationSubmission(r.academic_record_id);
    setLoadingId(null);

    if (!result.ok || !result.data) {
      toast.error("Could not open this application", {
        description: result.ok ? "The original submission may have been removed." : result.error,
      });
      return;
    }
    setActive(result.data);
  }

  const filtered = React.useMemo(() => {
    const q = term.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) =>
      [r.student_name, r.reference_code, r.institution_name, r.note, r.contact_no]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(q),
    );
  }, [rows, term]);

  const withChanges = rows.filter((r) => r.has_changes).length;

  return (
    <>
      <PageHeader
        title="Confirmations"
        description="What students told us when confirming their details at /confirm — click one to open and edit their application directly."
      />

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[220px] flex-1 sm:max-w-sm">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            placeholder="Search name, code, note…"
            className="pl-9"
            aria-label="Search confirmations"
          />
        </div>
        <Badge variant="secondary">{rows.length} total</Badge>
        {withChanges > 0 && <Badge variant="warning">{withChanges} with corrections</Badge>}
      </div>

      <TableWrap className="max-h-[calc(100vh-320px)]">
        <Table className="min-w-[900px] table-fixed">
          <TableHeader>
            <TableRow>
              <TableHead className="w-[16%]">Student</TableHead>
              <TableHead className="w-[9%]">Code</TableHead>
              <TableHead className="w-[14%]">Std / Course</TableHead>
              <TableHead className="w-[27%]">What they said</TableHead>
              <TableHead className="w-[12%]">Contact</TableHead>
              <TableHead className="w-[12%]">Submitted</TableHead>
              <TableHead className="w-[10%] text-right">
                <span className="sr-only">Actions</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={7} className="border-b-0">
                  <EmptyState
                    icon={MessageSquareText}
                    title={rows.length > 0 ? "Nothing matches your search" : "Nothing here yet"}
                    description="Confirmations students send from /confirm will show up here."
                  />
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((r) => (
                <TableRow
                  key={r.id}
                  className={`cursor-pointer ${loadingId === r.id ? "opacity-60" : ""}`}
                  onClick={() => void openRow(r)}
                >
                  <TableCell className="max-w-0">
                    <span className="block truncate font-medium" title={r.student_name}>
                      {r.student_name}
                    </span>
                    <span className="block truncate text-[11px] text-muted-foreground">
                      {r.institution_name ?? "—"}
                    </span>
                  </TableCell>
                  <TableCell className="truncate font-mono text-[12px] text-muted-foreground">
                    {r.reference_code}
                  </TableCell>
                  <TableCell className="max-w-0 truncate text-muted-foreground">{r.placement}</TableCell>
                  <TableCell className="max-w-0">
                    {r.has_changes && r.note ? (
                      <span className="block truncate" title={r.note}>
                        {r.note}
                      </span>
                    ) : (
                      <Badge variant="success">
                        <CheckCircle2 className="h-3 w-3" /> Confirmed, no changes
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="tabular truncate text-muted-foreground">{r.contact_no}</TableCell>
                  <TableCell className="text-muted-foreground">{formatDateTime(r.created_at)}</TableCell>
                  <TableCell className="text-right">
                    {canDelete && (
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label="Delete"
                        onClick={(e) => {
                          e.stopPropagation();
                          setPendingDelete(r);
                        }}
                      >
                        <Trash2 className="text-destructive" />
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </TableWrap>

      <SubmissionReviewSheet
        submission={active}
        lookups={lookups}
        onOpenChange={(open) => !open && setActive(null)}
      />

      <ConfirmDialog
        open={Boolean(pendingDelete)}
        onOpenChange={(open) => !open && setPendingDelete(null)}
        title={`Delete this entry from ${pendingDelete?.student_name ?? "this student"}?`}
        description="This only removes the note/confirmation record — it never touches the student's actual roster data."
        onConfirm={async () => {
          const result = await deleteDataConfirmation(pendingDelete!.id);
          if (result.ok) router.refresh();
          return result;
        }}
      />
    </>
  );
}
