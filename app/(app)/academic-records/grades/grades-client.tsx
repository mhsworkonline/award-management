"use client";

import * as React from "react";
import { GraduationCap, Loader2, Save } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { EmptyState, PageHeader } from "@/components/shell/page-header";
import { Field, FieldGrid } from "@/components/form/field";
import { fetchRosterForGrading, saveGrades, type RosterEntry } from "@/lib/actions/academic-records";
import type { Lookups } from "@/lib/types";

type DraftEntry = RosterEntry & { dirty: boolean };

/** A whole class's percentage/grade/rank entered in one pass — the natural unit
 *  grading actually happens in, rather than one student at a time. */
export function GradesClient({
  lookups,
  defaultYearId,
}: {
  lookups: Lookups;
  defaultYearId: string | null;
}) {
  const [instType, setInstType] = React.useState<"school" | "college" | "">("");
  const [boardId, setBoardId] = React.useState("");
  const [institutionId, setInstitutionId] = React.useState("");
  const [yearId, setYearId] = React.useState(defaultYearId ?? "");
  const [standardId, setStandardId] = React.useState("");
  const [courseId, setCourseId] = React.useState("");
  const [periodNo, setPeriodNo] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [entries, setEntries] = React.useState<DraftEntry[]>([]);
  const [loaded, setLoaded] = React.useState(false);

  const isCollege = instType === "college";
  const course = lookups.courses.find((c) => c.id === courseId);

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

  React.useEffect(() => {
    setStandardId("");
    setCourseId("");
    setPeriodNo("");
    setEntries([]);
    setLoaded(false);
  }, [institutionId]);

  const canLoad = Boolean(
    institutionId && yearId && (isCollege ? courseId && periodNo : standardId),
  );

  async function load() {
    setLoading(true);
    const result = await fetchRosterForGrading({
      institution_id: institutionId,
      academic_year_id: yearId,
      standard_id: isCollege ? undefined : standardId || undefined,
      course_id: isCollege ? courseId || undefined : undefined,
      period_no: isCollege && periodNo ? Number(periodNo) : undefined,
    });
    setLoading(false);
    setLoaded(true);

    if (!result.ok) {
      toast.error("Could not load roster", { description: result.error });
      return;
    }
    setEntries(result.data.map((r) => ({ ...r, dirty: false })));
  }

  function update(id: string, field: "percentage" | "grade" | "rank", value: string) {
    setEntries((prev) =>
      prev.map((e) =>
        e.id === id
          ? {
              ...e,
              dirty: true,
              [field]:
                field === "grade" ? (value || null) : value === "" ? null : Number(value),
            }
          : e,
      ),
    );
  }

  async function saveAll() {
    const dirty = entries.filter((e) => e.dirty);
    if (dirty.length === 0) {
      toast.info("No changes to save");
      return;
    }

    setSaving(true);
    const result = await saveGrades(
      dirty.map((e) => ({ id: e.id, percentage: e.percentage, grade: e.grade, rank: e.rank })),
    );
    setSaving(false);

    if (!result.ok) {
      toast.error("Save failed", { description: result.error });
      return;
    }

    if (result.data.failed > 0) {
      toast.warning(`Saved ${result.data.saved}, ${result.data.failed} row(s) failed validation`);
    } else {
      toast.success(`Saved grades for ${result.data.saved} student${result.data.saved === 1 ? "" : "s"}`);
    }
    setEntries((prev) => prev.map((e) => ({ ...e, dirty: false })));
  }

  const dirtyCount = entries.filter((e) => e.dirty).length;

  return (
    <>
      <PageHeader
        title="Grade entry"
        description="Enter percentage, grade or rank for a whole class at once. This is what award suggestions are based on."
      />

      <Card>
        <CardHeader>
          <CardTitle>Choose scope</CardTitle>
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
              hint={
                !instType
                  ? "Select a type first"
                  : instType === "school" && !boardId
                    ? "Select a board first"
                    : undefined
              }
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

          {institutionId &&
            (isCollege ? (
              <FieldGrid>
                <Field label="Course" required>
                  <Select value={courseId} onValueChange={setCourseId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select course" />
                    </SelectTrigger>
                    <SelectContent>
                      {lookups.courses.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
                <Field label={course?.structure_type === "semester" ? "Semester" : "Year"} required>
                  <Select value={periodNo} onValueChange={setPeriodNo} disabled={!course}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select" />
                    </SelectTrigger>
                    <SelectContent>
                      {Array.from({ length: course?.total_periods ?? 0 }, (_, i) => i + 1).map((n) => (
                        <SelectItem key={n} value={String(n)}>
                          {course?.structure_type === "semester" ? `Semester ${n}` : `Year ${n}`}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
              </FieldGrid>
            ) : (
              <Field label="Standard" required>
                <Select value={standardId} onValueChange={setStandardId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select standard" />
                  </SelectTrigger>
                  <SelectContent>
                    {lookups.standards.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            ))}

          <div className="flex justify-end">
            <Button onClick={() => void load()} disabled={!canLoad || loading}>
              {loading ? <Loader2 className="animate-spin" /> : <GraduationCap />}
              {loading ? "Loading…" : "Load roster"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {loaded && (
        <>
          <TableWrap className="max-h-[calc(100vh-460px)]">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[10%]">Roll no</TableHead>
                  <TableHead className="w-[40%]">Student</TableHead>
                  <TableHead className="w-[18%]">Percentage</TableHead>
                  <TableHead className="w-[14%]">Grade</TableHead>
                  <TableHead className="w-[14%]">Rank</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {entries.length === 0 ? (
                  <TableRow className="hover:bg-transparent">
                    <TableCell colSpan={5} className="border-b-0">
                      <EmptyState
                        icon={GraduationCap}
                        title="No students enrolled in this scope"
                        description="Add students under this institution, year and standard/course first."
                      />
                    </TableCell>
                  </TableRow>
                ) : (
                  entries.map((e) => (
                    <TableRow key={e.id} className={e.dirty ? "bg-primary/5" : undefined}>
                      <TableCell className="tabular text-muted-foreground">{e.roll_no || "—"}</TableCell>
                      <TableCell className="font-medium">
                        {e.first_name} {e.last_name}
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          min={0}
                          max={100}
                          step="0.01"
                          className="tabular h-8 w-24"
                          value={e.percentage ?? ""}
                          onChange={(ev) => update(e.id, "percentage", ev.target.value)}
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          className="h-8 w-20"
                          value={e.grade ?? ""}
                          onChange={(ev) => update(e.id, "grade", ev.target.value)}
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          min={1}
                          className="tabular h-8 w-20"
                          value={e.rank ?? ""}
                          onChange={(ev) => update(e.id, "rank", ev.target.value)}
                        />
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </TableWrap>

          {entries.length > 0 && (
            <div className="flex items-center justify-between rounded-lg border bg-card px-4 py-3 shadow-soft">
              <p className="text-[13px] text-muted-foreground">
                {dirtyCount > 0 ? (
                  <span className="font-medium text-foreground">{dirtyCount} unsaved change{dirtyCount === 1 ? "" : "s"}</span>
                ) : (
                  "No unsaved changes"
                )}
              </p>
              <Button onClick={() => void saveAll()} disabled={saving || dirtyCount === 0}>
                {saving ? <Loader2 className="animate-spin" /> : <Save />}
                {saving ? "Saving…" : `Save ${dirtyCount || ""} grade${dirtyCount === 1 ? "" : "s"}`}
              </Button>
            </div>
          )}
        </>
      )}
    </>
  );
}
