"use client";

import * as React from "react";
import { FileBarChart, FileDown, FileText, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { useQueryParams } from "@/hooks/use-query-params";
import type { ReportRow } from "@/lib/data/reports";
import type { Lookups } from "@/lib/types";

export function ReportsClient({
  rows,
  lookups,
  filterDescription,
  query,
}: {
  rows: ReportRow[];
  lookups: Lookups;
  filterDescription: string;
  query: string;
}) {
  const { searchParams } = useQueryParams();
  const [groupByInstitution, setGroupByInstitution] = React.useState(true);
  const [signatureColumn, setSignatureColumn] = React.useState(true);

  const pdfHref = `/api/reports/pdf${query}${query ? "&" : "?"}group=${
    groupByInstitution ? "on" : "off"
  }&signature=${signatureColumn ? "on" : "off"}`;

  const distributed = rows.filter((r) => r.distribution === "Distributed").length;
  const pending = rows.filter((r) => r.distribution === "Pending").length;
  const noGift = rows.filter((r) => r.distribution === "No gift allocated").length;

  return (
    <>
      <PageHeader
        title="Reports"
        description="Filter the data, preview it, then print a distribution list or export to Excel."
        actions={
          <>
            <Button asChild variant="outline">
              <a href={`/api/reports/excel${query}`}>
                <FileDown /> Excel
              </a>
            </Button>
            <Button asChild>
              <a href={pdfHref} target="_blank" rel="noreferrer">
                <Printer /> Generate PDF
              </a>
            </Button>
          </>
        }
      />

      <FilterBar
        lookups={lookups}
        advanced={[
          "institution_id",
          "institution_type",
          "board_id",
          "medium_id",
          "standard_id",
          "course_id",
          "award_category_id",
        ]}
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Current selection</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-[13px] text-muted-foreground">{filterDescription}</p>
            <div className="flex flex-wrap gap-2">
              <Badge variant="secondary">{rows.length} students</Badge>
              <Badge variant="success">{distributed} distributed</Badge>
              <Badge variant="warning">{pending} pending</Badge>
              {noGift > 0 && <Badge variant="outline">{noGift} without a gift</Badge>}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>PDF options</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2.5">
            <Toggle
              checked={groupByInstitution}
              onChange={setGroupByInstitution}
              label="Group by institution"
              hint="One section per school or college"
            />
            <Toggle
              checked={signatureColumn}
              onChange={setSignatureColumn}
              label="Signature column"
              hint="Blank column for receipts at the venue"
            />
          </CardContent>
        </Card>
      </div>

      <TableWrap className="max-h-[calc(100vh-460px)]">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[18%]">Student</TableHead>
              <TableHead className="w-[14%]">Father</TableHead>
              <TableHead className="w-[18%]">Institution</TableHead>
              <TableHead className="w-[11%]">Std / Course</TableHead>
              <TableHead className="w-[13%]">Award(s)</TableHead>
              <TableHead className="w-[14%]">Gift(s)</TableHead>
              <TableHead className="w-[12%]">Distribution</TableHead>
            </TableRow>
          </TableHeader>

          <TableBody>
            {rows.length === 0 ? (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={7} className="border-b-0">
                  <EmptyState
                    icon={FileBarChart}
                    title="Nothing matches these filters"
                    description="Widen the filters above to include more students."
                  />
                </TableCell>
              </TableRow>
            ) : (
              rows.slice(0, 500).map((row, index) => (
                <TableRow key={`${row.student_name}-${index}`}>
                  <TableCell className="font-medium">{row.student_name}</TableCell>
                  <TableCell className="text-muted-foreground">{row.father_name || "—"}</TableCell>
                  <TableCell className="text-muted-foreground">
                    <span className="truncate">{row.institution_name}</span>
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary">{row.placement}</Badge>
                  </TableCell>
                  <TableCell>{row.awards || "—"}</TableCell>
                  <TableCell className="text-muted-foreground">{row.gifts || "—"}</TableCell>
                  <TableCell>
                    <Badge
                      variant={
                        row.distribution === "Distributed"
                          ? "success"
                          : row.distribution === "Pending"
                            ? "warning"
                            : "outline"
                      }
                    >
                      {row.distribution}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </TableWrap>

      {rows.length > 500 && (
        <p className="flex items-center gap-2 text-[13px] text-muted-foreground">
          <FileText className="h-4 w-4" />
          Previewing the first 500 of {rows.length.toLocaleString("en-IN")} rows. The PDF and Excel
          export contain everything that matches these filters.
        </p>
      )}
    </>
  );
}

function Toggle({
  checked,
  onChange,
  label,
  hint,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  label: string;
  hint: string;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-2.5">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 h-4 w-4 rounded border-input accent-[hsl(var(--primary))]"
      />
      <span>
        <span className="block text-[13px] font-medium leading-tight">{label}</span>
        <span className="block text-[12px] text-muted-foreground">{hint}</span>
      </span>
    </label>
  );
}
