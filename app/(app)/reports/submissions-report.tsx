"use client";

import * as React from "react";
import { FileDown, FileText, ListChecks, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import {
  DEFAULT_SUBMISSION_LIST_COLUMNS,
  SUBMISSION_LIST_COLUMNS,
  groupSubmissionRows,
  type SubmissionColumnKey,
  type SubmissionListRow,
} from "@/lib/data/submission-report-columns";
import type { Lookups } from "@/lib/types";
import { YearSelect } from "./year-select";
import { PdfTitleLogoFields } from "./pdf-title-logo-fields";

export function SubmissionsReport({
  rows,
  lookups,
  yearId,
  hasLogo,
}: {
  rows: SubmissionListRow[];
  lookups: Lookups;
  yearId: string | null;
  hasLogo: boolean;
}) {
  const [checked, setChecked] = React.useState<Set<SubmissionColumnKey>>(
    () => new Set(DEFAULT_SUBMISSION_LIST_COLUMNS),
  );
  const [title, setTitle] = React.useState("");
  const [includeLogo, setIncludeLogo] = React.useState(true);

  // Always render in the fixed, sensible order from SUBMISSION_LIST_COLUMNS —
  // not the order columns happened to be checked in.
  const activeColumns = SUBMISSION_LIST_COLUMNS.filter((c) => checked.has(c.key));

  function toggle(key: SubmissionColumnKey, value: boolean) {
    setChecked((prev) => {
      const next = new Set(prev);
      if (value) next.add(key);
      else next.delete(key);
      return next;
    });
  }

  const columnsParam = activeColumns.map((c) => c.key).join(",");
  const excelQuery = yearId
    ? `?academic_year_id=${yearId}${columnsParam ? `&columns=${columnsParam}` : ""}`
    : "";
  const pdfQuery = yearId
    ? `?academic_year_id=${yearId}${columnsParam ? `&columns=${columnsParam}` : ""}&logo=${
        includeLogo && hasLogo ? "on" : "off"
      }${title.trim() ? `&title=${encodeURIComponent(title.trim())}` : ""}`
    : "";
  const canDownload = !!yearId && rows.length > 0 && activeColumns.length > 0;

  // Grouped for preview the same way the exports group — one section per
  // Standard/course — capped to the first 500 rows total across groups.
  const groups = groupSubmissionRows(rows);
  let remaining = 500;
  const previewGroups = groups
    .map((g) => {
      const groupRows = g.rows.slice(0, remaining);
      remaining -= groupRows.length;
      return { ...g, rows: groupRows };
    })
    .filter((g) => g.rows.length > 0);

  return (
    <>
      <PageHeader
        title="Submissions List"
        description="Every approved application for one academic year — pick the columns to show and export."
        actions={
          <>
            <Button asChild variant="outline" className={!canDownload ? "pointer-events-none opacity-50" : ""}>
              <a
                href={canDownload ? `/api/reports/submissions/excel${excelQuery}` : undefined}
                aria-disabled={!canDownload}
              >
                <FileDown /> Excel
              </a>
            </Button>
            <Button asChild className={!canDownload ? "pointer-events-none opacity-50" : ""}>
              <a
                href={canDownload ? `/api/reports/submissions/pdf${pdfQuery}` : undefined}
                target="_blank"
                rel="noreferrer"
                aria-disabled={!canDownload}
              >
                <Printer /> Generate PDF
              </a>
            </Button>
          </>
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <YearSelect lookups={lookups} />
        {yearId && <Badge variant="secondary">{rows.length} approved applications</Badge>}
      </div>

      {!yearId ? (
        <Card>
          <CardContent className="py-10">
            <EmptyState
              icon={FileText}
              title="Choose an academic year"
              description="Pick a year above to list its approved applications."
            />
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid gap-4 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <ListChecks className="h-4 w-4" /> Columns
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-x-4 gap-y-2.5 sm:grid-cols-3 lg:grid-cols-4">
                  {SUBMISSION_LIST_COLUMNS.map((col) => (
                    <label
                      key={col.key}
                      className="flex cursor-pointer items-center gap-2 text-[13px] font-medium"
                    >
                      <Checkbox
                        checked={checked.has(col.key)}
                        onCheckedChange={(v) => toggle(col.key, v === true)}
                      />
                      {col.label}
                    </label>
                  ))}
                </div>
                {activeColumns.length === 0 && (
                  <p className="mt-3 text-[13px] text-warning">Select at least one column to preview or export.</p>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>PDF options</CardTitle>
              </CardHeader>
              <CardContent>
                <PdfTitleLogoFields
                  title={title}
                  onTitleChange={setTitle}
                  includeLogo={includeLogo}
                  onIncludeLogoChange={setIncludeLogo}
                  hasLogo={hasLogo}
                />
              </CardContent>
            </Card>
          </div>

          <TableWrap className="max-h-[calc(100vh-460px)]">
            <Table
              className="table-fixed"
              style={{ minWidth: `${Math.max(activeColumns.length, 1) * 160}px` }}
            >
              <TableHeader>
                <TableRow>
                  {activeColumns.map((col) => (
                    <TableHead key={col.key} style={{ width: 160 }}>
                      {col.label}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {activeColumns.length === 0 ? (
                  <TableRow className="hover:bg-transparent">
                    <TableCell colSpan={1} className="border-b-0">
                      <EmptyState
                        icon={ListChecks}
                        title="No columns selected"
                        description="Check at least one column above to see a preview."
                      />
                    </TableCell>
                  </TableRow>
                ) : rows.length === 0 ? (
                  <TableRow className="hover:bg-transparent">
                    <TableCell colSpan={activeColumns.length} className="border-b-0">
                      <EmptyState
                        icon={FileText}
                        title="No approved applications"
                        description="No submissions were approved for this academic year yet."
                      />
                    </TableCell>
                  </TableRow>
                ) : (
                  previewGroups.map((group) => (
                    <React.Fragment key={group.key}>
                      <TableRow className="bg-muted/40 hover:bg-muted/40">
                        <TableCell colSpan={activeColumns.length} className="font-semibold">
                          {group.label}{" "}
                          <span className="font-normal text-muted-foreground">
                            ({group.rows.length} student{group.rows.length === 1 ? "" : "s"})
                          </span>
                        </TableCell>
                      </TableRow>
                      {group.rows.map((row, index) => (
                        <TableRow key={`${row.code}-${index}`}>
                          {activeColumns.map((col) => (
                            <TableCell
                              key={col.key}
                              className={col.key === "applicant" ? "font-medium" : "text-muted-foreground"}
                            >
                              {row[col.key] || "—"}
                            </TableCell>
                          ))}
                        </TableRow>
                      ))}
                    </React.Fragment>
                  ))
                )}
              </TableBody>
            </Table>
          </TableWrap>

          {rows.length > 500 && (
            <p className="flex items-center gap-2 text-[13px] text-muted-foreground">
              <FileText className="h-4 w-4" />
              Previewing the first 500 of {rows.length.toLocaleString("en-IN")} rows. The PDF and Excel
              export contain every approved application for this year.
            </p>
          )}
        </>
      )}
    </>
  );
}
