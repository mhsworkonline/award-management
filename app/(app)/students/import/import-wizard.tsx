"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Copy,
  Download,
  FileSpreadsheet,
  Loader2,
  Upload,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableWrap,
} from "@/components/ui/table";
import { Field, FieldGrid } from "@/components/form/field";
import { PageHeader } from "@/components/shell/page-header";
import { commitImport } from "@/lib/actions/students";
import type { ParsedImportRow } from "@/app/api/students/import/route";
import type { Lookups } from "@/lib/types";

type Summary = {
  total: number;
  valid: number;
  withErrors: number;
  duplicates: number;
  matchedExisting: number;
};

type Step = "select" | "review" | "done";

export function ImportWizard({
  lookups,
  defaultYearId,
}: {
  lookups: Lookups;
  defaultYearId: string | null;
}) {
  const router = useRouter();
  const [step, setStep] = React.useState<Step>("select");
  const [instType, setInstType] = React.useState<"school" | "college" | "">("");
  const [boardId, setBoardId] = React.useState("");
  const [institutionId, setInstitutionId] = React.useState("");
  const [yearId, setYearId] = React.useState(defaultYearId ?? "");
  const [file, setFile] = React.useState<File | null>(null);
  const [parsing, setParsing] = React.useState(false);
  const [committing, setCommitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [rows, setRows] = React.useState<ParsedImportRow[]>([]);
  const [summary, setSummary] = React.useState<Summary | null>(null);
  const [selected, setSelected] = React.useState<Set<number>>(new Set());
  const [inserted, setInserted] = React.useState(0);

  const institution = lookups.institutions.find((i) => i.id === institutionId);
  const importable = rows.filter((r) => r.errors.length === 0);

  const availableInstitutions = lookups.institutions.filter((i) => {
    if (!instType || i.type !== instType) return false;
    if (boardId) return i.board_id === boardId;
    return true;
  });

  function handleInstTypeChange(v: "school" | "college") {
    setInstType(v);
    setBoardId("");
    setInstitutionId("");
  }

  function handleBoardChange(v: string) {
    setBoardId(v);
    setInstitutionId("");
  }

  async function upload() {
    if (!file || !institutionId || !yearId) return;
    setParsing(true);
    setError(null);

    const body = new FormData();
    body.set("file", file);
    body.set("institution_id", institutionId);
    body.set("academic_year_id", yearId);

    try {
      const res = await fetch("/api/students/import", { method: "POST", body });
      const json = await res.json();

      if (!res.ok) {
        setError(json.error ?? "Could not read the file");
        return;
      }

      const parsedRows = json.rows as ParsedImportRow[];
      setRows(parsedRows);
      setSummary(json.summary as Summary);
      // Pre-select every clean row, except ones duplicated within the file
      // itself — a match against the database is expected (enrolling an
      // existing student) and safe to import as-is.
      setSelected(
        new Set(
          parsedRows
            .filter((r) => r.errors.length === 0 && r.duplicate?.source !== "file")
            .map((r) => r.rowNumber),
        ),
      );
      setStep("review");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setParsing(false);
    }
  }

  async function commit() {
    const payload = rows.filter((r) => selected.has(r.rowNumber) && r.errors.length === 0);
    if (payload.length === 0) {
      toast.error("Select at least one valid row");
      return;
    }

    setCommitting(true);
    const result = await commitImport({
      institution_id: institutionId,
      academic_year_id: yearId,
      rows: payload.map((r) => ({
        first_name: r.first_name,
        middle_name: r.middle_name,
        last_name: r.last_name,
        roll_no: r.roll_no,
        contact_no: r.contact_no,
        standard_id: r.standard_id,
        course_id: r.course_id,
        period_no: r.period_no,
      })),
    });
    setCommitting(false);

    if (!result.ok) {
      toast.error("Import failed", { description: result.error });
      return;
    }

    setInserted(result.data.inserted);
    setStep("done");
    router.refresh();
  }

  function toggle(rowNumber: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(rowNumber)) next.delete(rowNumber);
      else next.add(rowNumber);
      return next;
    });
  }

  function toggleAll(checked: boolean) {
    setSelected(checked ? new Set(importable.map((r) => r.rowNumber)) : new Set());
  }

  function restart() {
    setStep("select");
    setFile(null);
    setRows([]);
    setSummary(null);
    setSelected(new Set());
    setError(null);
    setInserted(0);
  }

  if (step === "done") {
    return (
      <>
        <PageHeader title="Import students" />
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-14 text-center">
            <span className="flex h-11 w-11 items-center justify-center rounded-full bg-success/12 text-success">
              <CheckCircle2 className="h-5 w-5" />
            </span>
            <p className="text-base font-semibold">
              Imported {inserted.toLocaleString("en-IN")} student
              {inserted === 1 ? "" : "s"}
            </p>
            <p className="max-w-sm text-[13px] text-muted-foreground">
              Added to {institution?.name} for{" "}
              {lookups.academicYears.find((y) => y.id === yearId)?.label}.
            </p>
            <div className="mt-3 flex gap-2">
              <Button variant="outline" onClick={restart}>
                Import another file
              </Button>
              <Button asChild>
                <Link href={`/students?institution_id=${institutionId}&academic_year_id=${yearId}`}>
                  View students
                </Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Import students"
        description="Upload an Excel sheet, review what was read, then confirm."
        actions={
          <>
            <Button asChild variant="outline">
              <a href="/api/students/template">
                <Download /> Template
              </a>
            </Button>
            <Button asChild variant="ghost">
              <Link href="/students">
                <ArrowLeft /> Back
              </Link>
            </Button>
          </>
        }
      />

      <Steps step={step} />

      {step === "select" && (
        <Card>
          <CardHeader>
            <CardTitle>1 · Choose destination and file</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <FieldGrid cols={1} className="sm:grid-cols-2 lg:grid-cols-4">
              <Field label="Institution type" required>
                <Select value={instType} onValueChange={(v) => handleInstTypeChange(v as "school" | "college")}>
                  <SelectTrigger>
                    <SelectValue placeholder="School or college" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="school">School (Std 1–12)</SelectItem>
                    <SelectItem value="college">College (degree / diploma)</SelectItem>
                  </SelectContent>
                </Select>
              </Field>

              {instType === "school" && (
                <Field label="Board" required>
                  <Select value={boardId} onValueChange={handleBoardChange}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select board" />
                    </SelectTrigger>
                    <SelectContent>
                      {lookups.boards.map((b) => (
                        <SelectItem key={b.id} value={b.id}>
                          {b.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
              )}

              <Field
                label="Institution"
                required
                hint="Every row in the file is imported into this institution"
              >
                <Select value={institutionId} onValueChange={setInstitutionId} disabled={!instType}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select institution" />
                  </SelectTrigger>
                  <SelectContent>
                    {availableInstitutions.length === 0 ? (
                      <div className="px-2 py-3 text-[13px] text-muted-foreground">
                        No institutions on this board
                      </div>
                    ) : (
                      availableInstitutions.map((i) => (
                        <SelectItem key={i.id} value={i.id}>
                          {i.name}
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
              </Field>

              <Field label="Academic year" required>
                <Select value={yearId} onValueChange={setYearId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select year" />
                  </SelectTrigger>
                  <SelectContent>
                    {lookups.academicYears.map((y) => (
                      <SelectItem key={y.id} value={y.id}>
                        {y.label}
                        {y.is_active ? " (active)" : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            </FieldGrid>

            <Field
              label="Excel file"
              required
              hint="Accepts .xlsx up to 8 MB, max 5,000 rows. Column names are matched loosely."
            >
              <label className="flex cursor-pointer flex-col items-center gap-2 rounded-lg border-2 border-dashed border-input px-6 py-9 text-center transition-colors hover:border-primary/50 hover:bg-accent/40">
                <FileSpreadsheet className="h-6 w-6 text-muted-foreground" />
                <span className="text-[13.5px] font-medium">
                  {file ? file.name : "Click to choose an .xlsx file"}
                </span>
                {file && (
                  <span className="text-[12px] text-muted-foreground">
                    {(file.size / 1024).toFixed(0)} KB
                  </span>
                )}
                <input
                  type="file"
                  accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                  className="sr-only"
                  onChange={(e) => {
                    setFile(e.target.files?.[0] ?? null);
                    setError(null);
                  }}
                />
              </label>
            </Field>

            {error && (
              <p className="rounded-md bg-destructive/10 px-3 py-2.5 text-[13px] font-medium text-destructive">
                {error}
              </p>
            )}

            <div className="flex justify-end">
              <Button
                onClick={() => void upload()}
                disabled={!file || !institutionId || !yearId || parsing}
              >
                {parsing ? <Loader2 className="animate-spin" /> : <Upload />}
                {parsing ? "Reading file…" : "Read file"}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {step === "review" && summary && (
        <>
          <div className="grid gap-3 sm:grid-cols-5">
            <Tile label="Rows read" value={summary.total} />
            <Tile label="Ready to import" value={summary.valid} variant="success" />
            <Tile label="Matches existing" value={summary.matchedExisting} />
            <Tile label="Duplicate in file" value={summary.duplicates} variant="warning" />
            <Tile label="Rows with errors" value={summary.withErrors} variant="destructive" />
          </div>

          {summary.withErrors > 0 && (
            <p className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/8 px-3.5 py-2.5 text-[13px]">
              <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
              <span>
                {summary.withErrors} row{summary.withErrors === 1 ? "" : "s"} cannot be imported and
                cannot be selected. Fix them in the sheet and upload again, or import the rest now.
              </span>
            </p>
          )}

          {summary.duplicates > 0 && (
            <p className="flex items-start gap-2 rounded-md border border-warning/40 bg-warning/8 px-3.5 py-2.5 text-[13px]">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
              <span>
                {summary.duplicates} possible duplicate
                {summary.duplicates === 1 ? " was" : "s were"} left unselected. Tick one to import
                it anyway.
              </span>
            </p>
          )}

          <TableWrap className="max-h-[520px]">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">
                    <Checkbox
                      checked={selected.size > 0 && selected.size === importable.length}
                      onCheckedChange={(c) => toggleAll(Boolean(c))}
                      aria-label="Select all importable rows"
                    />
                  </TableHead>
                  <TableHead className="w-14">Row</TableHead>
                  <TableHead>Student</TableHead>
                  <TableHead>Middle (father)</TableHead>
                  <TableHead>Std / Course</TableHead>
                  <TableHead>Roll no</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => {
                  const blocked = row.errors.length > 0;
                  return (
                    <TableRow
                      key={row.rowNumber}
                      className={blocked ? "bg-destructive/5" : row.duplicate ? "bg-warning/5" : undefined}
                    >
                      <TableCell>
                        <Checkbox
                          checked={selected.has(row.rowNumber)}
                          disabled={blocked}
                          onCheckedChange={() => toggle(row.rowNumber)}
                          aria-label={`Select row ${row.rowNumber}`}
                        />
                      </TableCell>
                      <TableCell className="tabular text-muted-foreground">{row.rowNumber}</TableCell>
                      <TableCell className="font-medium">
                        {[row.first_name, row.last_name].filter(Boolean).join(" ") || "—"}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {row.middle_name || "—"}
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary">{row.placement}</Badge>
                      </TableCell>
                      <TableCell className="tabular text-muted-foreground">
                        {row.roll_no || "—"}
                      </TableCell>
                      <TableCell>
                        {blocked ? (
                          <span className="flex flex-col gap-0.5">
                            {row.errors.map((e) => (
                              <span
                                key={e}
                                className="text-[12px] font-medium leading-snug text-destructive"
                              >
                                {e}
                              </span>
                            ))}
                          </span>
                        ) : row.duplicate ? (
                          <span className="flex items-center gap-1.5">
                            <Copy className="h-3.5 w-3.5 shrink-0 text-warning" />
                            <span className="text-[12px] leading-snug text-warning">
                              {row.duplicate.detail}
                            </span>
                          </span>
                        ) : (
                          <Badge variant="success">Ready</Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </TableWrap>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-[13px] text-muted-foreground">
              <span className="tabular font-medium text-foreground">{selected.size}</span> of{" "}
              {importable.length} importable row{importable.length === 1 ? "" : "s"} selected
            </p>
            <div className="flex gap-2">
              <Button variant="outline" onClick={restart} disabled={committing}>
                Start over
              </Button>
              <Button onClick={() => void commit()} disabled={committing || selected.size === 0}>
                {committing && <Loader2 className="animate-spin" />}
                {committing ? "Importing…" : `Import ${selected.size} student${selected.size === 1 ? "" : "s"}`}
              </Button>
            </div>
          </div>
        </>
      )}
    </>
  );
}

function Steps({ step }: { step: Step }) {
  const items = [
    { key: "select", label: "Upload" },
    { key: "review", label: "Review" },
    { key: "done", label: "Confirm" },
  ] as const;
  const activeIndex = items.findIndex((i) => i.key === step);

  return (
    <ol className="flex items-center gap-2 text-[13px]">
      {items.map((item, index) => (
        <li key={item.key} className="flex items-center gap-2">
          <span
            className={
              index <= activeIndex
                ? "flex h-6 w-6 items-center justify-center rounded-full bg-primary text-[12px] font-semibold text-primary-foreground"
                : "flex h-6 w-6 items-center justify-center rounded-full bg-muted text-[12px] font-semibold text-muted-foreground"
            }
          >
            {index + 1}
          </span>
          <span className={index <= activeIndex ? "font-medium" : "text-muted-foreground"}>
            {item.label}
          </span>
          {index < items.length - 1 && <span className="mx-1 h-px w-8 bg-border" />}
        </li>
      ))}
    </ol>
  );
}

function Tile({
  label,
  value,
  variant,
}: {
  label: string;
  value: number;
  variant?: "success" | "warning" | "destructive";
}) {
  const tone =
    variant === "success"
      ? "text-success"
      : variant === "warning"
        ? "text-warning"
        : variant === "destructive"
          ? "text-destructive"
          : "text-foreground";

  return (
    <div className="rounded-lg border bg-card p-4 shadow-soft">
      <p className="text-[12px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className={`tabular mt-1 text-xl font-semibold leading-none ${tone}`}>
        {value.toLocaleString("en-IN")}
      </p>
    </div>
  );
}
