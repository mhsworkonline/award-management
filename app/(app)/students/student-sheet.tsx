"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { AlertTriangle, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Field, FieldGrid } from "@/components/form/field";
import { checkDuplicateStudents, saveStudent, type DuplicateMatch } from "@/lib/actions/students";
import { saveAcademicRecord } from "@/lib/actions/academic-records";
import type { AcademicRecordRow, Lookups } from "@/lib/types";

type Values = {
  first_name: string;
  middle_name: string;
  last_name: string;
  contact_no: string;
  remarks: string;
  institution_id: string;
  academic_year_id: string;
  standard_id: string;
  course_id: string;
  period_no: string;
  roll_no: string;
};

/** Edit-only — creating a student happens on the dedicated /students/new page.
 *  Saves the persistent identity and this year's enrollment together, as two
 *  calls behind one form, since that's how the operator experiences it. */
export function StudentSheet({
  open,
  onOpenChange,
  record,
  lookups,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  record: AcademicRecordRow | null;
  lookups: Lookups;
}) {
  const router = useRouter();
  const [duplicates, setDuplicates] = React.useState<DuplicateMatch[]>([]);
  const [checking, setChecking] = React.useState(false);
  const [serverError, setServerError] = React.useState<string | null>(null);
  const [instType, setInstType] = React.useState<"school" | "college" | "">("");
  const [boardId, setBoardId] = React.useState("");

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<Values>();

  const institutionId = watch("institution_id");
  const courseId = watch("course_id");
  const firstName = watch("first_name");
  const middleName = watch("middle_name");
  const lastName = watch("last_name");

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
    setValue("institution_id", "", { shouldValidate: true });
  }

  function handleBoardChange(v: string) {
    setBoardId(v);
    setValue("institution_id", "", { shouldValidate: true });
  }

  React.useEffect(() => {
    if (!open || !record) return;
    setDuplicates([]);
    setServerError(null);

    const inst = lookups.institutions.find((i) => i.id === record.institution_id);
    setInstType(inst?.type ?? "");
    setBoardId(inst?.board_id ?? "");

    reset({
      first_name: record.students?.first_name ?? "",
      middle_name: record.students?.middle_name ?? "",
      last_name: record.students?.last_name ?? "",
      contact_no: record.students?.contact_no ?? "",
      remarks: record.remarks ?? "",
      institution_id: record.institution_id,
      academic_year_id: record.academic_year_id,
      standard_id: record.standard_id ?? "",
      course_id: record.course_id ?? "",
      period_no: record.period_no ? String(record.period_no) : "",
      roll_no: record.roll_no ?? "",
    });
  }, [open, record, reset, lookups.institutions]);

  React.useEffect(() => {
    if (!institutionId) return;
    if (isCollege) setValue("standard_id", "");
    else {
      setValue("course_id", "");
      setValue("period_no", "");
    }
  }, [institutionId, isCollege, setValue]);

  React.useEffect(() => {
    if (!firstName?.trim() || !lastName?.trim()) {
      setDuplicates([]);
      return;
    }
    const timer = window.setTimeout(async () => {
      setChecking(true);
      const result = await checkDuplicateStudents({
        first_name: firstName,
        middle_name: middleName || null,
        last_name: lastName,
        excludeId: record?.student_id,
      });
      setChecking(false);
      setDuplicates(result.ok ? result.data : []);
    }, 450);
    return () => window.clearTimeout(timer);
  }, [firstName, middleName, lastName, record?.student_id]);

  async function onSubmit(values: Values) {
    if (!record) return;
    setServerError(null);

    const studentResult = await saveStudent({
      id: record.student_id,
      first_name: values.first_name,
      middle_name: values.middle_name || undefined,
      last_name: values.last_name,
      contact_no: values.contact_no || undefined,
    });
    if (!studentResult.ok) {
      setServerError(
        studentResult.fieldErrors
          ? Object.values(studentResult.fieldErrors).flat().join(" · ")
          : studentResult.error,
      );
      return;
    }

    const recordResult = await saveAcademicRecord({
      id: record.id,
      student_id: record.student_id,
      institution_id: values.institution_id,
      academic_year_id: values.academic_year_id,
      standard_id: values.standard_id || null,
      course_id: values.course_id || null,
      period_no: values.period_no ? Number(values.period_no) : null,
      roll_no: values.roll_no || undefined,
      remarks: values.remarks || undefined,
    });
    if (!recordResult.ok) {
      setServerError(
        recordResult.fieldErrors
          ? Object.values(recordResult.fieldErrors).flat().join(" · ")
          : recordResult.error,
      );
      return;
    }

    toast.success("Student updated");
    router.refresh();
    onOpenChange(false);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      void handleSubmit(onSubmit)();
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-xl" onKeyDown={onKeyDown}>
        <form onSubmit={handleSubmit(onSubmit)} className="flex h-full flex-col">
          <SheetHeader>
            <SheetTitle>Edit student</SheetTitle>
            <SheetDescription>Update identity and this year&apos;s enrollment.</SheetDescription>
          </SheetHeader>

          <SheetBody className="space-y-5">
            <FieldGrid cols={1} className="sm:grid-cols-3">
              <Field label="First name" htmlFor="first_name" required error={errors.first_name?.message}>
                <Input id="first_name" autoFocus autoComplete="off" {...register("first_name", { required: "Required" })} />
              </Field>
              <Field label="Middle (father's)" htmlFor="middle_name">
                <Input id="middle_name" autoComplete="off" {...register("middle_name")} />
              </Field>
              <Field label="Last name" htmlFor="last_name" required error={errors.last_name?.message}>
                <Input id="last_name" autoComplete="off" {...register("last_name", { required: "Required" })} />
              </Field>
            </FieldGrid>

            <FieldGrid>
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
            </FieldGrid>

            <FieldGrid>
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
                <Select
                  value={institutionId}
                  onValueChange={(v) => setValue("institution_id", v, { shouldValidate: true })}
                  disabled={!instType}
                >
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
                <input type="hidden" {...register("institution_id", { required: "Required" })} />
              </Field>

              <Field label="Academic year" required>
                <Select
                  value={watch("academic_year_id")}
                  onValueChange={(v) => setValue("academic_year_id", v, { shouldValidate: true })}
                >
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
                <input type="hidden" {...register("academic_year_id", { required: "Required" })} />
              </Field>
            </FieldGrid>

            {isCollege ? (
              <FieldGrid>
                <Field label="Course" required>
                  <Select value={courseId} onValueChange={(v) => setValue("course_id", v)}>
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
                <Field
                  label={course?.structure_type === "semester" ? "Semester" : "Year"}
                  required
                  hint={course ? `1 to ${course.total_periods}` : "Select a course first"}
                >
                  <Select
                    value={watch("period_no")}
                    onValueChange={(v) => setValue("period_no", v)}
                    disabled={!course}
                  >
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
                <Select
                  value={watch("standard_id")}
                  onValueChange={(v) => setValue("standard_id", v)}
                  disabled={!institutionId}
                >
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
            )}

            <FieldGrid>
              <Field label="Roll / GR no" htmlFor="roll_no">
                <Input id="roll_no" autoComplete="off" {...register("roll_no")} />
              </Field>
              <Field label="Contact no" htmlFor="contact_no">
                <Input id="contact_no" inputMode="tel" autoComplete="off" {...register("contact_no")} />
              </Field>
            </FieldGrid>

            <Field label="Remarks" htmlFor="remarks" hint="For this enrollment year">
              <Textarea id="remarks" rows={2} {...register("remarks")} />
            </Field>

            {duplicates.length > 0 && (
              <div className="rounded-lg border border-warning/40 bg-warning/8 p-3.5">
                <p className="flex items-center gap-2 text-[13px] font-semibold text-warning">
                  <AlertTriangle className="h-4 w-4" />
                  Possible duplicate{duplicates.length > 1 ? "s" : ""} found
                </p>
                <ul className="mt-2.5 space-y-1.5">
                  {duplicates.map((d) => (
                    <li key={d.id} className="flex flex-wrap items-center gap-2 text-[13px]">
                      <span className="font-medium">{d.name}</span>
                      {d.enrollments.map((e) => (
                        <Badge key={e} variant="outline">
                          {e}
                        </Badge>
                      ))}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {serverError && (
              <p className="rounded-md bg-destructive/10 px-3 py-2 text-[13px] font-medium text-destructive">
                {serverError}
              </p>
            )}
          </SheetBody>

          <SheetFooter className="items-center justify-between">
            <div className="mr-auto">
              {checking && (
                <span className="flex items-center gap-1.5 text-[12px] text-muted-foreground">
                  <Loader2 className="h-3 w-3 animate-spin" /> checking duplicates
                </span>
              )}
            </div>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting && <Loader2 className="animate-spin" />}
              Save changes
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}
