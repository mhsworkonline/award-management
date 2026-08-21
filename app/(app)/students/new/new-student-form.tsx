"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { AlertTriangle, ArrowLeft, Image as ImageIcon, Loader2, Save, Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Field, FieldGrid } from "@/components/form/field";
import { QuickAddInstitution } from "@/components/form/quick-add-institution";
import { PageHeader } from "@/components/shell/page-header";
import { checkDuplicateStudents, createStudentWithRecord, type DuplicateMatch } from "@/lib/actions/students";
import { loadRememberedDefaults, saveRememberedDefaults } from "@/lib/remember";
import { createClient } from "@/lib/supabase/client";
import { STUDENT_PHOTOS_BUCKET } from "@/lib/tables";
import { ALLOWED_PHOTO_TYPES, MAX_PHOTO_BYTES } from "@/lib/attachments";
import { MAX_SOURCE_IMAGE_BYTES, compressStudentPhoto } from "@/lib/image-compression";
import { SALUTATIONS } from "@/lib/types";
import type { Lookups } from "@/lib/types";

type Values = {
  salutation: string;
  first_name: string;
  middle_name: string;
  last_name: string;
  email: string;
  contact_no: string;
  remarks: string;
  institution_id: string;
  academic_year_id: string;
  standard_id: string;
  course_id: string;
  period_no: string;
  roll_no: string;
  percentage: string;
  grade: string;
};

const EMPTY: Values = {
  salutation: "",
  first_name: "",
  middle_name: "",
  last_name: "",
  email: "",
  contact_no: "",
  remarks: "",
  institution_id: "",
  academic_year_id: "",
  standard_id: "",
  course_id: "",
  period_no: "",
  roll_no: "",
  percentage: "",
  grade: "",
};

/** The primary data-entry surface — a full page rather than a slide-over so an
 *  operator entering dozens of students in a row has maximum room and a fast,
 *  uninterrupted keyboard flow. */
export function NewStudentForm({
  lookups,
  defaultYearId,
  defaultInstitutionId,
}: {
  lookups: Lookups;
  defaultYearId: string | null;
  defaultInstitutionId: string | null;
}) {
  const router = useRouter();
  const [keepOpen, setKeepOpen] = React.useState(true);
  const [duplicates, setDuplicates] = React.useState<DuplicateMatch[]>([]);
  const [checking, setChecking] = React.useState(false);
  const [serverError, setServerError] = React.useState<string | null>(null);
  const [addedCount, setAddedCount] = React.useState(0);
  const firstNameRef = React.useRef<HTMLInputElement | null>(null);

  // Compulsory, single photograph. Uploaded to Storage the moment it's picked
  // (there's no student id to scope the path to yet) so the path is ready by
  // the time the form submits; the preview shown is a local object URL, so it
  // appears immediately regardless of upload progress.
  const [photoFile, setPhotoFile] = React.useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = React.useState<string | null>(null);
  const [photoPath, setPhotoPath] = React.useState<string | null>(null);
  const [photoUploading, setPhotoUploading] = React.useState(false);
  const [photoError, setPhotoError] = React.useState<string | null>(null);
  const photoInputRef = React.useRef<HTMLInputElement | null>(null);

  React.useEffect(() => {
    return () => {
      if (photoPreview) URL.revokeObjectURL(photoPreview);
    };
  }, [photoPreview]);

  async function handlePhotoFile(file: File | null) {
    if (photoInputRef.current) photoInputRef.current.value = "";
    if (!file) return;
    setPhotoError(null);

    if (!ALLOWED_PHOTO_TYPES.includes(file.type)) {
      setPhotoError("Only JPEG, PNG or WebP images are allowed");
      return;
    }
    if (file.size > MAX_SOURCE_IMAGE_BYTES) {
      setPhotoError(`Must be ${MAX_SOURCE_IMAGE_BYTES / (1024 * 1024)}MB or smaller`);
      return;
    }

    setPhotoUploading(true);
    let compressed: File;
    try {
      compressed = await compressStudentPhoto(file);
    } catch {
      setPhotoUploading(false);
      setPhotoError("Could not process this image — try a different file");
      return;
    }
    if (compressed.size > MAX_PHOTO_BYTES) {
      setPhotoUploading(false);
      setPhotoError("This image is too large even after compression — try a different file");
      return;
    }

    if (photoPreview) URL.revokeObjectURL(photoPreview);
    setPhotoFile(compressed);
    setPhotoPreview(URL.createObjectURL(compressed));
    setPhotoPath(null);

    const supabase = createClient();
    const safeName = compressed.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const path = `${crypto.randomUUID()}-${safeName}`;
    const upload = await supabase.storage
      .from(STUDENT_PHOTOS_BUCKET)
      .upload(path, compressed, { contentType: compressed.type });
    setPhotoUploading(false);
    if (upload.error) {
      setPhotoError("Upload failed — please try again");
      return;
    }
    setPhotoPath(path);
  }

  function removePhoto() {
    if (photoPreview) URL.revokeObjectURL(photoPreview);
    setPhotoFile(null);
    setPhotoPreview(null);
    setPhotoPath(null);
    setPhotoError(null);
  }

  // Type → Board → Institution cascade. An explicit deep link
  // (defaultInstitutionId, e.g. "Add student" from an institution page) wins;
  // otherwise the operator's last selection is remembered across visits
  // (lib/remember.ts) so repeat data entry doesn't start from scratch.
  const defaultInstitution = lookups.institutions.find((i) => i.id === defaultInstitutionId);
  const [instType, setInstType] = React.useState<"school" | "college" | "">(
    defaultInstitution?.type ?? "",
  );
  const [boardId, setBoardId] = React.useState(defaultInstitution?.board_id ?? "");
  const [pendingInstitutions, setPendingInstitutions] = React.useState<Lookups["institutions"]>([]);
  const institutions = [
    ...lookups.institutions,
    ...pendingInstitutions.filter((p) => !lookups.institutions.some((i) => i.id === p.id)),
  ];

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<Values>({
    defaultValues: {
      ...EMPTY,
      academic_year_id: defaultYearId ?? "",
      institution_id: defaultInstitutionId ?? "",
    },
  });

  const institutionId = watch("institution_id");
  const academicYearId = watch("academic_year_id");
  const courseId = watch("course_id");
  const firstName = watch("first_name");
  const middleName = watch("middle_name");
  const lastName = watch("last_name");

  const { ref: firstNameFieldRef, ...firstNameField } = register("first_name", {
    required: "First name is required",
  });

  const isCollege = instType === "college";
  const course = lookups.courses.find((c) => c.id === courseId);
  const selectedBoard = lookups.boards.find((b) => b.id === boardId);

  const availableInstitutions = institutions.filter((i) => {
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

  function handleInstitutionCreated(inst: Lookups["institutions"][number]) {
    setPendingInstitutions((prev) => [...prev, inst]);
    setValue("institution_id", inst.id, { shouldValidate: true });
  }

  // Apply the remembered selection once on mount — but only when there's no
  // explicit deep link, which always wins.
  const [hydrated, setHydrated] = React.useState(false);
  React.useEffect(() => {
    if (!defaultInstitution) {
      const remembered = loadRememberedDefaults();
      const rememberedInstitution = remembered.institutionId
        ? lookups.institutions.find((i) => i.id === remembered.institutionId)
        : undefined;

      if (rememberedInstitution) {
        setInstType(rememberedInstitution.type);
        setBoardId(rememberedInstitution.board_id ?? "");
        setValue("institution_id", rememberedInstitution.id);
      } else if (remembered.instType) {
        setInstType(remembered.instType);
        if (remembered.boardId) setBoardId(remembered.boardId);
      }

      const rememberedYear = remembered.academicYearId
        ? lookups.academicYears.find((y) => y.id === remembered.academicYearId)
        : undefined;
      if (rememberedYear) setValue("academic_year_id", rememberedYear.id);
    }
    setHydrated(true);
    // Deliberately mount-only — this is a one-time hydration from storage.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Remember every change so the next visit to this page starts where the
  // operator left off.
  React.useEffect(() => {
    if (!hydrated) return;
    saveRememberedDefaults({
      instType: instType || undefined,
      boardId: boardId || undefined,
      institutionId: institutionId || undefined,
      academicYearId: academicYearId || undefined,
    });
  }, [hydrated, instType, boardId, institutionId, academicYearId]);

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
      });
      setChecking(false);
      setDuplicates(result.ok ? result.data : []);
    }, 450);
    return () => window.clearTimeout(timer);
  }, [firstName, middleName, lastName]);

  async function onSubmit(values: Values) {
    setServerError(null);

    if (!photoPath) {
      setPhotoError(
        photoUploading ? "Still uploading — wait a moment and try again" : "A photograph of the student is required",
      );
      return;
    }

    const result = await createStudentWithRecord({
      salutation: values.salutation || null,
      first_name: values.first_name,
      middle_name: values.middle_name || null,
      last_name: values.last_name,
      email: values.email || null,
      contact_no: values.contact_no,
      photo_path: photoPath,
      remarks: values.remarks || null,
      institution_id: values.institution_id,
      academic_year_id: values.academic_year_id,
      standard_id: values.standard_id || null,
      course_id: values.course_id || null,
      period_no: values.period_no ? Number(values.period_no) : null,
      roll_no: values.roll_no || null,
      percentage: values.percentage ? Number(values.percentage) : null,
      grade: values.grade || null,
    });

    if (!result.ok) {
      setServerError(
        result.fieldErrors ? Object.values(result.fieldErrors).flat().join(" · ") : result.error,
      );
      return;
    }

    toast.success("Student added");
    setAddedCount((n) => n + 1);
    router.refresh();

    if (!keepOpen) {
      router.push(`/students?academic_year_id=${values.academic_year_id}`);
      return;
    }

    reset({
      ...EMPTY,
      institution_id: values.institution_id,
      academic_year_id: values.academic_year_id,
      standard_id: values.standard_id,
      course_id: values.course_id,
      period_no: values.period_no,
    });
    setDuplicates([]);
    removePhoto();
    firstNameRef.current?.focus();
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      void handleSubmit(onSubmit)();
    }
  }

  return (
    <div onKeyDown={onKeyDown}>
      <PageHeader
        title="Add student"
        description="Institution, year and class carry over to the next entry."
        actions={
          <Button asChild variant="ghost">
            <Link href="/students">
              <ArrowLeft /> Back to students
            </Link>
          </Button>
        }
      />

      <form onSubmit={handleSubmit(onSubmit)} className="max-w-3xl space-y-5">
        <Card>
          <CardHeader>
            <CardTitle>Identity</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <FieldGrid cols={1} className="sm:grid-cols-4">
              <Field label="Salutation" htmlFor="salutation">
                <Select value={watch("salutation")} onValueChange={(v) => setValue("salutation", v)}>
                  <SelectTrigger>
                    <SelectValue placeholder="—" />
                  </SelectTrigger>
                  <SelectContent>
                    {SALUTATIONS.map((s) => (
                      <SelectItem key={s} value={s}>
                        {s}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="First name" htmlFor="first_name" required error={errors.first_name?.message}>
                <Input
                  id="first_name"
                  autoComplete="off"
                  placeholder="Riya"
                  {...firstNameField}
                  ref={(el) => {
                    firstNameFieldRef(el);
                    firstNameRef.current = el;
                  }}
                />
              </Field>
              <Field label="Middle (father's)" htmlFor="middle_name" hint="Father's first name">
                <Input id="middle_name" autoComplete="off" placeholder="Mahesh" {...register("middle_name")} />
              </Field>
              <Field label="Last name" htmlFor="last_name" required error={errors.last_name?.message}>
                <Input
                  id="last_name"
                  autoComplete="off"
                  placeholder="Patel"
                  {...register("last_name", { required: "Last name is required" })}
                />
              </Field>
            </FieldGrid>

            <FieldGrid>
              <Field label="Email" htmlFor="email" error={errors.email?.message}>
                <Input id="email" type="email" inputMode="email" autoComplete="off" {...register("email")} />
              </Field>
              <Field label="Contact no" htmlFor="contact_no" required error={errors.contact_no?.message}>
                <Input
                  id="contact_no"
                  inputMode="tel"
                  autoComplete="off"
                  {...register("contact_no", { required: "Required" })}
                />
              </Field>
            </FieldGrid>

            <Field
              label="Photograph"
              required
              error={photoError ?? undefined}
              hint="JPEG, PNG or WebP — resized automatically."
            >
              <div className="flex items-center gap-4">
                <span className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-lg border bg-muted/30">
                  {photoPreview ? (
                    // eslint-disable-next-line @next/next/no-img-element -- local object URL preview
                    <img src={photoPreview} alt="Student photograph preview" className="h-full w-full object-cover" />
                  ) : (
                    <ImageIcon className="h-6 w-6 text-muted-foreground" />
                  )}
                </span>
                <div className="flex flex-col items-start gap-2">
                  <input
                    ref={photoInputRef}
                    type="file"
                    className="sr-only"
                    accept={ALLOWED_PHOTO_TYPES.join(",")}
                    onChange={(e) => void handlePhotoFile(e.target.files?.[0] ?? null)}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={photoUploading}
                    onClick={() => photoInputRef.current?.click()}
                  >
                    {photoUploading ? <Loader2 className="animate-spin" /> : <Upload />}
                    {photoUploading ? "Processing…" : photoFile ? "Replace photo" : "Choose photo"}
                  </Button>
                  {photoFile && !photoUploading && (
                    <button
                      type="button"
                      onClick={removePhoto}
                      className="text-[12px] font-medium text-muted-foreground hover:text-destructive"
                    >
                      Remove
                    </button>
                  )}
                </div>
              </div>
            </Field>

            {duplicates.length > 0 && (
              <div className="rounded-lg border border-warning/40 bg-warning/8 p-3.5">
                <p className="flex items-center gap-2 text-[13px] font-semibold text-warning">
                  <AlertTriangle className="h-4 w-4" />
                  Possible duplicate{duplicates.length > 1 ? "s" : ""} found
                </p>
                <p className="mt-1 text-[12px] text-muted-foreground">
                  A student with this name already exists. You can still save if this is a different
                  person.
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
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>This year&apos;s enrollment</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <FieldGrid cols={1} className="sm:grid-cols-2 lg:grid-cols-4">
              <Field label="Institution type" required>
                <Select
                  value={instType}
                  onValueChange={(v) => handleInstTypeChange(v as "school" | "college")}
                >
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
                <Field label="Board" required hint={lookups.boards.length === 0 ? "Add a board under Settings first" : undefined}>
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
                error={errors.institution_id?.message}
                hint={
                  !instType
                    ? "Select a type first"
                    : instType === "school" && !boardId
                      ? "Select a board first"
                      : undefined
                }
              >
                <div className="flex gap-2">
                  <Select
                    value={institutionId}
                    onValueChange={(v) => setValue("institution_id", v, { shouldValidate: true })}
                    disabled={!instType || (instType === "school" && !boardId)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select institution" />
                    </SelectTrigger>
                    <SelectContent>
                      {availableInstitutions.length === 0 ? (
                        <div className="px-2 py-3 text-[13px] text-muted-foreground">
                          {boardId ? "No institutions on this board" : "None yet"}
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
                  <QuickAddInstitution
                    instType={instType}
                    boardId={boardId}
                    boardName={selectedBoard?.name ?? ""}
                    mediums={lookups.mediums}
                    onCreated={handleInstitutionCreated}
                  />
                </div>
                <input type="hidden" {...register("institution_id", { required: "Required" })} />
              </Field>

              <Field label="Academic year" required error={errors.academic_year_id?.message}>
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
              <Field
                label="Standard"
                required
                hint={!institutionId ? "Select an institution first" : "Includes LKG and UKG"}
              >
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

            <FieldGrid cols={1} className="sm:grid-cols-3">
              <Field label="Roll / GR no" htmlFor="roll_no">
                <Input id="roll_no" autoComplete="off" {...register("roll_no")} />
              </Field>
              <Field label="Percentage" htmlFor="percentage" error={errors.percentage?.message} hint="Optional">
                <Input
                  id="percentage"
                  type="number"
                  inputMode="decimal"
                  step="0.01"
                  min={0}
                  max={100}
                  className="tabular"
                  {...register("percentage", {
                    min: { value: 0, message: "0 to 100" },
                    max: { value: 100, message: "0 to 100" },
                  })}
                />
              </Field>
              <Field label="Grade" htmlFor="grade" hint="Optional — e.g. A+, Distinction">
                <Input id="grade" autoComplete="off" {...register("grade")} />
              </Field>
            </FieldGrid>

            <Field label="Remarks" htmlFor="remarks">
              <Textarea id="remarks" rows={2} {...register("remarks")} />
            </Field>
          </CardContent>
        </Card>

        {serverError && (
          <p className="rounded-md bg-destructive/10 px-3 py-2 text-[13px] font-medium text-destructive">
            {serverError}
          </p>
        )}

        <div className="flex items-center justify-between rounded-lg border bg-card px-4 py-3 shadow-soft">
          <div className="flex items-center gap-4">
            <label className="flex cursor-pointer select-none items-center gap-2 text-[13px] text-muted-foreground">
              <input
                type="checkbox"
                checked={keepOpen}
                onChange={(e) => setKeepOpen(e.target.checked)}
                className="h-3.5 w-3.5 rounded border-input accent-[hsl(var(--primary))]"
              />
              Keep this page open for the next entry
            </label>
            {checking && (
              <span className="flex items-center gap-1.5 text-[12px] text-muted-foreground">
                <Loader2 className="h-3 w-3 animate-spin" /> checking duplicates
              </span>
            )}
            {addedCount > 0 && (
              <Badge variant="success">{addedCount} added this session</Badge>
            )}
          </div>
          <Button type="submit" disabled={isSubmitting || photoUploading}>
            {isSubmitting ? <Loader2 className="animate-spin" /> : <Save />}
            {isSubmitting ? "Saving…" : "Add student"}
          </Button>
        </div>
      </form>
    </div>
  );
}
