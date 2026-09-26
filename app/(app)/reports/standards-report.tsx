"use client";

import * as React from "react";
import { Award, FileDown, GraduationCap, Printer, Users } from "lucide-react";
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
import type { StandardReport } from "@/lib/data/submission-reports";
import type { Lookups } from "@/lib/types";
import { YearSelect } from "./year-select";
import { PdfTitleLogoFields } from "./pdf-title-logo-fields";
import { InstitutionTypeFilter } from "./institution-type-filter";
import { DEFAULT_PDF_TEXT_SIZE, type PdfTextSize } from "@/lib/pdf/text-size";
import { useQueryParams } from "@/hooks/use-query-params";
import {
  parseInstitutionTypes,
  serializeInstitutionTypes,
} from "@/lib/data/submission-report-columns";

export function StandardsReport({
  report,
  lookups,
  yearId,
  hasLogo,
}: {
  report: StandardReport;
  lookups: Lookups;
  yearId: string | null;
  hasLogo: boolean;
}) {
  const { categories, rows } = report;
  const totalStudents = rows.reduce((s, r) => s + r.totalStudents, 0);
  const totalAwarded = rows.reduce((s, r) => s + r.awarded, 0);

  const [title, setTitle] = React.useState("");
  const [includeLogo, setIncludeLogo] = React.useState(true);
  const [textSize, setTextSize] = React.useState<PdfTextSize>(DEFAULT_PDF_TEXT_SIZE);

  // The counts are computed server-side, so the type choice lives in the URL
  // (?types=school) and reloads the table, rather than in local state.
  const { searchParams, setParams } = useQueryParams();
  const types = parseInstitutionTypes(searchParams.get("types"));
  const typesParam = types.size > 0 ? `&types=${serializeInstitutionTypes(types)}` : "";

  const excelQuery = yearId ? `?academic_year_id=${yearId}${typesParam}` : "";
  const pdfQuery = yearId
    ? `?academic_year_id=${yearId}${typesParam}&size=${textSize}&logo=${includeLogo && hasLogo ? "on" : "off"}${
        title.trim() ? `&title=${encodeURIComponent(title.trim())}` : ""
      }`
    : "";
  const canDownload = !!yearId && rows.length > 0;
  const minTableWidth = 200 + 130 * 2 + Math.max(categories.length, 1) * 110;

  return (
    <>
      <PageHeader
        title="Applications by Standard"
        description="Approved applications for one academic year, grouped by Standard, with award counts per category."
        actions={
          <>
            <Button asChild variant="outline" className={!canDownload ? "pointer-events-none opacity-50" : ""}>
              <a
                href={canDownload ? `/api/reports/standards/excel${excelQuery}` : undefined}
                aria-disabled={!canDownload}
              >
                <FileDown /> Excel
              </a>
            </Button>
            <Button asChild className={!canDownload ? "pointer-events-none opacity-50" : ""}>
              <a
                href={canDownload ? `/api/reports/standards/pdf${pdfQuery}` : undefined}
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
          <div className="flex flex-wrap gap-2">
            <Badge variant="secondary">
              <Users className="h-3 w-3" /> {totalStudents} approved students
            </Badge>
            <Badge variant="success">
              <Award className="h-3 w-3" /> {totalAwarded} awarded
            </Badge>
          </div>
        )}
      </div>

      {!yearId ? (
        <Card>
          <CardContent className="py-10">
            <EmptyState
              icon={GraduationCap}
              title="Choose an academic year"
              description="Pick a year above to see approved applications grouped by Standard."
            />
          </CardContent>
        </Card>
      ) : (
        <>
        <Card>
          <CardHeader>
            <CardTitle>Report options</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <InstitutionTypeFilter
              value={types}
              onChange={(next) => setParams({ types: serializeInstitutionTypes(next) || null })}
            />
            <div className="border-t pt-4">
            <PdfTitleLogoFields
              title={title}
              onTitleChange={setTitle}
              includeLogo={includeLogo}
              onIncludeLogoChange={setIncludeLogo}
              hasLogo={hasLogo}
              textSize={textSize}
              onTextSizeChange={setTextSize}
            />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Standard-wise summary</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <TableWrap className="max-h-[calc(100vh-420px)]">
              <Table className="table-fixed" style={{ minWidth: `${minTableWidth}px` }}>
                <TableHeader>
                  <TableRow>
                    <TableHead style={{ width: 200 }}>Standard</TableHead>
                    <TableHead className="text-center" style={{ width: 130 }}>
                      Total Students
                    </TableHead>
                    <TableHead className="text-center" style={{ width: 130 }}>
                      Awarded
                    </TableHead>
                    {categories.map((c) => (
                      <TableHead key={c.id} className="text-center" style={{ width: 110 }}>
                        {c.name}
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.length === 0 ? (
                    <TableRow className="hover:bg-transparent">
                      <TableCell colSpan={3 + categories.length} className="border-b-0">
                        <EmptyState
                          icon={GraduationCap}
                          title="No approved applications"
                          description="No submissions were approved for this academic year yet."
                        />
                      </TableCell>
                    </TableRow>
                  ) : (
                    <>
                      {rows.map((row) => (
                        <TableRow key={row.key}>
                          <TableCell className="font-medium">{row.label}</TableCell>
                          <TableCell className="text-center">{row.totalStudents}</TableCell>
                          <TableCell className="text-center">
                            <Badge variant={row.awarded > 0 ? "success" : "outline"}>{row.awarded}</Badge>
                          </TableCell>
                          {categories.map((c) => (
                            <TableCell key={c.id} className="text-center text-muted-foreground">
                              {row.categoryCounts[c.id] ?? 0}
                            </TableCell>
                          ))}
                        </TableRow>
                      ))}
                      <TableRow className="bg-muted/40 font-semibold hover:bg-muted/40">
                        <TableCell>Total</TableCell>
                        <TableCell className="text-center">{totalStudents}</TableCell>
                        <TableCell className="text-center">{totalAwarded}</TableCell>
                        {categories.map((c) => (
                          <TableCell key={c.id} className="text-center">
                            {rows.reduce((s, r) => s + (r.categoryCounts[c.id] ?? 0), 0)}
                          </TableCell>
                        ))}
                      </TableRow>
                    </>
                  )}
                </TableBody>
              </Table>
            </TableWrap>
          </CardContent>
        </Card>
        </>
      )}
    </>
  );
}
