"use client";

import * as React from "react";
import { ChevronDown, FileDown, FileText, ListChecks, Printer } from "lucide-react";
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
  DEFAULT_SUBMISSION_SORT,
  SUBMISSION_LIST_COLUMNS,
  SUBMISSION_SORT_OPTIONS,
  filterByInstitutionTypes,
  filterByInstitutions,
  groupSubmissionRows,
  institutionOptions,
  parseSubmissionSort,
  serializeInstitutionFilter,
  serializeInstitutionTypes,
  type InstitutionTypeKey,
  type SubmissionColumnKey,
  type SubmissionListRow,
  type SubmissionSortKey,
} from "@/lib/data/submission-report-columns";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { Lookups } from "@/lib/types";
import { YearSelect } from "./year-select";
import { PdfTitleLogoFields } from "./pdf-title-logo-fields";
import { InstitutionTypeFilter } from "./institution-type-filter";

export function SubmissionsReport({
  rows: allRows,
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
  const [sort, setSort] = React.useState<SubmissionSortKey>(DEFAULT_SUBMISSION_SORT);
  // Empty = every institution.
  const [institutionKeys, setInstitutionKeys] = React.useState<Set<string>>(() => new Set());

  // Empty = every type. Narrows both the institution checklist below and the rows.
  const [types, setTypes] = React.useState<Set<InstitutionTypeKey>>(() => new Set());
  const typeRows = React.useMemo(() => filterByInstitutionTypes(allRows, types), [allRows, types]);

  const institutions = React.useMemo(() => institutionOptions(typeRows), [typeRows]);
  // Drop selections that no longer exist (e.g. after switching academic year).
  const activeKeys = React.useMemo(
    () => new Set([...institutionKeys].filter((k) => institutions.some((i) => i.key === k))),
    [institutionKeys, institutions],
  );
  const rows = React.useMemo(() => filterByInstitutions(typeRows, activeKeys), [typeRows, activeKeys]);

  function toggleInstitution(key: string, value: boolean) {
    setInstitutionKeys((prev) => {
      const next = new Set(prev);
      if (value) next.add(key);
      else next.delete(key);
      return next;
    });
  }
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
  const institutionParam =
    (types.size > 0 ? `&types=${serializeInstitutionTypes(types)}` : "") +
    (activeKeys.size > 0 ? `&institutions=${encodeURIComponent(serializeInstitutionFilter(activeKeys))}` : "");
  const excelQuery = yearId
    ? `?academic_year_id=${yearId}${columnsParam ? `&columns=${columnsParam}` : ""}&sort=${sort}${institutionParam}`
    : "";
  const pdfQuery = yearId
    ? `?academic_year_id=${yearId}${columnsParam ? `&columns=${columnsParam}` : ""}&sort=${sort}${institutionParam}&logo=${
        includeLogo && hasLogo ? "on" : "off"
      }${title.trim() ? `&title=${encodeURIComponent(title.trim())}` : ""}`
    : "";
  const canDownload = !!yearId && rows.length > 0 && activeColumns.length > 0;

  // Grouped for preview the same way the exports group — one section per
  // Standard/course — capped to the first 500 rows total across groups.
  const groups = groupSubmissionRows(rows, sort);
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
        {yearId && (
          <Badge variant="secondary">
            {rows.length}
            {rows.length !== allRows.length && ` of ${allRows.length}`} approved applications
          </Badge>
        )}
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
                <div className="mt-4 grid gap-4 border-t pt-4 sm:grid-cols-2">
                <InstitutionTypeFilter value={types} onChange={setTypes} />
                <div className="flex flex-col gap-1.5">
                  <span className="text-[13px] font-medium">Institutions to include</span>
                  <Popover>
                    <PopoverTrigger asChild>
                      <button
                        type="button"
                        className="flex h-9 w-full items-center justify-between whitespace-nowrap rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm ring-offset-background hover:bg-accent/50 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1"
                      >
                        <span className="truncate text-left">
                          {activeKeys.size === 0 ? "All institutions" : `${activeKeys.size} selected`}
                        </span>
                        <ChevronDown className="h-4 w-4 shrink-0 opacity-50" />
                      </button>
                    </PopoverTrigger>
                    <PopoverContent className="w-[var(--radix-popover-trigger-width)] min-w-64" align="start">
                      <div className="scrollbar-thin max-h-64 space-y-0.5 overflow-y-auto">
                        {institutions.map((i) => (
                          <label
                            key={i.key}
                            className="flex cursor-pointer items-center gap-2 rounded px-1.5 py-1.5 text-[13px] hover:bg-accent"
                          >
                            <Checkbox
                              checked={activeKeys.has(i.key)}
                              onCheckedChange={(v) => toggleInstitution(i.key, v === true)}
                            />
                            <span className="truncate">{i.name}</span>
                          </label>
                        ))}
                      </div>
                      {activeKeys.size > 0 && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="mt-2 w-full"
                          onClick={() => setInstitutionKeys(new Set())}
                        >
                          Clear — include all
                        </Button>
                      )}
                    </PopoverContent>
                  </Popover>
                </div>
                <div className="flex flex-col gap-1.5">
                  <span className="text-[13px] font-medium">Sort students within each Standard / course by</span>
                  <Select value={sort} onValueChange={(v) => setSort(parseSubmissionSort(v))}>
                    <SelectTrigger aria-label="Sort students by">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {SUBMISSION_SORT_OPTIONS.map((o) => (
                        <SelectItem key={o.key} value={o.key}>
                          {o.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                </div>
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
              export contain every application matching the selected institution types and institutions.
            </p>
          )}
        </>
      )}
    </>
  );
}
