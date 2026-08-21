"use client";

import * as React from "react";
import { useForm } from "react-hook-form";
import { CheckCircle2, Copy, FileText, Image as ImageIcon, Loader2, Paperclip, Send, Trophy, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardTitle, CardDescription } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Field, FieldGrid } from "@/components/form/field";
import { registerAttachment, submitPublicApplication } from "@/lib/actions/public-application";
import { OTHER_OPTION_VALUE as OTHER } from "@/lib/validators";
import { createClient } from "@/lib/supabase/client";
import { ATTACHMENTS_BUCKET } from "@/lib/tables";
import { ALLOWED_ATTACHMENT_TYPES, MAX_ATTACHMENTS, MAX_ATTACHMENT_BYTES } from "@/lib/attachments";
import { SALUTATIONS } from "@/lib/types";
import { APPLY_LABELS as L } from "@/lib/apply-form-i18n";
import type { PublicBranding, PublicFormOptions, ResolvedForm } from "@/lib/types";

type Values = {
  salutation: string;
  first_name: string;
  middle_name: string;
  last_name: string;
  email: string;
  contact_no: string;
  institution_id: string;
  other_institution_name: string;
  board_id: string;
  other_board_name: string;
  medium_id: string;
  standard_id: string;
  course_id: string;
  other_course_name: string;
  other_course_structure: "" | "year" | "semester";
  period_no: string;
  roll_no: string;
  percentage: string;
  grade: string;
  notes: string;
  website: string; // honeypot
};

const EMPTY: Values = {
  salutation: "",
  first_name: "",
  middle_name: "",
  last_name: "",
  email: "",
  contact_no: "",
  institution_id: "",
  other_institution_name: "",
  board_id: "",
  other_board_name: "",
  medium_id: "",
  standard_id: "",
  course_id: "",
  other_course_name: "",
  other_course_structure: "",
  period_no: "",
  roll_no: "",
  percentage: "",
  grade: "",
  notes: "",
  website: "",
};

const MAX_FILE_BYTES = MAX_ATTACHMENT_BYTES;
const MAX_FILES = MAX_ATTACHMENTS;
const ALLOWED_TYPES = ALLOWED_ATTACHMENT_TYPES;

/** Single-column, mobile-first by construction — every field stacks full-width
 *  regardless of viewport; the two-up rows only appear from `sm:` up. */
export function ApplyForm({
  form,
  options,
  branding,
}: {
  form: NonNullable<ResolvedForm>;
  options: PublicFormOptions;
  branding: PublicBranding;
}) {
  const fieldConfig = form.fieldConfig;
  const nameFieldCount = 2 + (fieldConfig.show_salutation ? 1 : 0) + (fieldConfig.show_middle_name ? 1 : 0);
  const nameGridClass =
    nameFieldCount === 4 ? "sm:grid-cols-4" : nameFieldCount === 3 ? "sm:grid-cols-3" : "sm:grid-cols-2";

  const [instType, setInstType] = React.useState<"school" | "college" | "">("");
  const [referenceCode, setReferenceCode] = React.useState<string | null>(null);
  const [serverError, setServerError] = React.useState<string | null>(null);
  const [files, setFiles] = React.useState<File[]>([]);
  const [fileError, setFileError] = React.useState<string | null>(null);
  const [uploading, setUploading] = React.useState(false);
  const fileInputRef = React.useRef<HTMLInputElement | null>(null);

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<Values>({ defaultValues: EMPTY });

  const institutionId = watch("institution_id");
  const courseId = watch("course_id");

  const isCollege = instType === "college";
  const isOtherInstitution = institutionId === OTHER;
  const isOtherCourse = courseId === OTHER;
  const course = options.courses.find((c) => c.id === courseId);

  const availableInstitutions = options.institutions.filter((i) => Boolean(instType) && i.type === instType);
  const selectedInstitution = isOtherInstitution
    ? undefined
    : options.institutions.find((i) => i.id === institutionId);

  // Board is always 1:1 with an institution — safe to fill in silently.
  // Medium isn't: an institution flagged "Both" teaches in more than one
  // language, so which one *this* applicant is in still needs asking.
  const selectedMedium = options.mediums.find((m) => m.id === selectedInstitution?.medium_id);
  const mediumIsAmbiguous = selectedMedium?.name.trim().toLowerCase() === "both";
  const needsBoardInput =
    instType === "school" && (isOtherInstitution || (Boolean(institutionId) && !selectedInstitution?.board_id));
  const needsMediumInput =
    instType === "school" &&
    Boolean(institutionId) &&
    (isOtherInstitution || !selectedInstitution?.medium_id || mediumIsAmbiguous);

  function handleInstTypeChange(v: "school" | "college") {
    setInstType(v);
    setValue("board_id", "");
    setValue("other_board_name", "");
    setValue("medium_id", "");
    setValue("institution_id", "");
    setValue("other_institution_name", "");
    setValue("standard_id", "");
    setValue("course_id", "");
    setValue("period_no", "");
  }

  // Every listed institution already carries a board and medium on file —
  // pick it and they fill in silently. They're only asked directly when
  // there's no institution row to read from (Other), or the value on file
  // isn't a single clear answer (see needsBoardInput/needsMediumInput above).
  function handleInstitutionChange(v: string) {
    setValue("institution_id", v, { shouldValidate: true });
    setValue("other_institution_name", "");
    setValue("other_board_name", "");
    const matched = v === OTHER ? undefined : options.institutions.find((i) => i.id === v);
    setValue("board_id", matched?.board_id ?? "", { shouldValidate: true });
    const matchedMedium = options.mediums.find((m) => m.id === matched?.medium_id);
    const ambiguous = matchedMedium?.name.trim().toLowerCase() === "both";
    setValue("medium_id", ambiguous ? "" : (matched?.medium_id ?? ""), { shouldValidate: true });
  }

  function addFiles(list: FileList | null) {
    if (!list) return;
    setFileError(null);
    const incoming = Array.from(list);
    const combined = [...files, ...incoming];

    if (combined.length > MAX_FILES) {
      setFileError(`Maximum ${MAX_FILES} files`);
      return;
    }
    for (const f of incoming) {
      if (!ALLOWED_TYPES.includes(f.type)) {
        setFileError(`${f.name}: only images, PDF or DOCX are allowed`);
        return;
      }
      if (f.size > MAX_FILE_BYTES) {
        setFileError(`${f.name}: must be 5MB or smaller`);
        return;
      }
    }
    setFiles(combined);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function removeFile(index: number) {
    setFiles((prev) => prev.filter((_, i) => i !== index));
    setFileError(null);
  }

  async function uploadAttachments(submissionId: string) {
    if (files.length === 0) return;
    const supabase = createClient();

    for (const file of files) {
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      const path = `${submissionId}/${crypto.randomUUID()}-${safeName}`;

      const upload = await supabase.storage.from(ATTACHMENTS_BUCKET).upload(path, file, {
        contentType: file.type,
      });
      if (upload.error) {
        toast.error(`Could not upload ${file.name}`, { description: upload.error.message });
        continue;
      }

      const registered = await registerAttachment({
        submissionId,
        filePath: path,
        fileName: file.name,
        mimeType: file.type,
        sizeBytes: file.size,
      });
      if (!registered.ok) {
        toast.error(`Could not attach ${file.name}`, { description: registered.error });
      }
    }
  }

  async function onSubmit(values: Values) {
    setServerError(null);

    // The marksheet is the only proof behind the percentage/grade claimed
    // above — required whenever this form even shows the field (staff can
    // still turn attachments off per-form via field_config).
    if (fieldConfig.show_attachments && files.length === 0) {
      setFileError("Upload your marksheet — required to verify your application");
      return;
    }

    const result = await submitPublicApplication(form.id, {
      salutation: values.salutation || undefined,
      first_name: values.first_name,
      middle_name: values.middle_name || undefined,
      last_name: values.last_name,
      email: values.email,
      contact_no: values.contact_no || undefined,
      institution_id: values.institution_id,
      other_institution_name: values.other_institution_name || undefined,
      board_id: values.board_id || null,
      other_board_name: values.other_board_name || undefined,
      medium_id: values.medium_id || null,
      standard_id: values.standard_id || null,
      course_id: values.course_id || null,
      other_course_name: values.other_course_name || undefined,
      other_course_structure: values.other_course_structure || null,
      period_no: values.period_no ? Number(values.period_no) : null,
      roll_no: values.roll_no || undefined,
      percentage: values.percentage,
      grade: values.grade,
      notes: values.notes || undefined,
      website: values.website,
    });

    if (!result.ok) {
      setServerError(
        result.fieldErrors ? Object.values(result.fieldErrors).flat().join(" · ") : result.error,
      );
      return;
    }

    if (files.length > 0) {
      setUploading(true);
      await uploadAttachments(result.data.id);
      setUploading(false);
    }

    setReferenceCode(result.data.referenceCode);
  }

  function copyCode() {
    if (!referenceCode) return;
    navigator.clipboard?.writeText(referenceCode).then(
      () => toast.success("Copied"),
      () => {},
    );
  }

  if (referenceCode) {
    return (
      <Card className="overflow-hidden">
        <div className="h-1.5 bg-gradient-to-r from-primary via-primary/70 to-primary" />
        <CardContent className="flex flex-col items-center gap-3 py-14 text-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-success/12 text-success">
            <CheckCircle2 className="h-6 w-6" />
          </span>
          <p className="text-xl font-semibold">Application received</p>
          <p className="max-w-sm text-[15px] text-muted-foreground">
            Your school or college will review and confirm your details. Save this code — quote it
            for any follow-up.
          </p>

          <button
            type="button"
            onClick={copyCode}
            className="mt-2 flex items-center gap-2 rounded-lg border bg-muted/40 px-5 py-3 font-mono text-lg font-semibold tracking-wide transition-colors hover:bg-muted/70"
          >
            {referenceCode}
            <Copy className="h-4 w-4 text-muted-foreground" />
          </button>

          <Button
            variant="outline"
            className="mt-4"
            onClick={() => {
              setReferenceCode(null);
              setInstType("");
              setFiles([]);
              reset(EMPTY);
            }}
          >
            Submit another application
          </Button>
        </CardContent>
      </Card>
    );
  }

  const busy = isSubmitting || uploading;

  return (
    <Card className="overflow-hidden">
      <div className="relative overflow-hidden bg-gradient-to-br from-primary to-primary/80 px-5 py-7 text-primary-foreground sm:px-6 sm:py-8">
        <Trophy className="pointer-events-none absolute -right-4 -top-4 h-28 w-28 rotate-12 text-primary-foreground/10" />
        <div className="relative flex items-center gap-3">
          {branding.logo_url ? (
            // eslint-disable-next-line @next/next/no-img-element -- external Supabase Storage URL
            <img
              src={branding.logo_url}
              alt=""
              className="h-11 w-11 shrink-0 rounded-lg bg-white/90 object-contain p-1"
            />
          ) : (
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-white/15">
              <Trophy className="h-5 w-5" />
            </span>
          )}
          <h2 className="truncate text-2xl font-bold leading-tight tracking-tight text-primary-foreground sm:text-3xl">
            {branding.app_name}
          </h2>
        </div>

        <CardTitle className="relative mt-3 text-lg font-semibold text-primary-foreground">
          {form.title}
          {form.titleGu && (
            <span className="mt-0.5 block text-[15px] font-normal text-primary-foreground/80">
              {form.titleGu}
            </span>
          )}
        </CardTitle>
        {(form.description || form.descriptionGu) && (
          <CardDescription className="relative mt-1.5 space-y-1 text-[15px] text-primary-foreground/80">
            {form.description && <span className="block">{form.description}</span>}
            {form.descriptionGu && <span className="block">{form.descriptionGu}</span>}
          </CardDescription>
        )}
      </div>
      <CardContent className="pt-6">
        <form
          onSubmit={handleSubmit(onSubmit)}
          className="space-y-6 [&_input]:text-base [&_label]:text-[15px] [&_p]:text-[13.5px] [&_textarea]:text-base [&_button[role=combobox]]:text-base"
          noValidate
        >
          {/* Honeypot — visually hidden (sr-only clip technique, not display:none,
              since some bots skip display:none but still fill hidden-but-present
              fields) without pulling the field off-canvas, which would otherwise
              widen the page and cause horizontal scroll on mobile. */}
          <div className="sr-only" aria-hidden="true">
            <label htmlFor="website">Leave this field blank</label>
            <input id="website" type="text" tabIndex={-1} autoComplete="off" {...register("website")} />
          </div>

          <FieldGrid cols={1} className={nameGridClass}>
            {fieldConfig.show_salutation && (
              <Field label={L.salutation} htmlFor="salutation">
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
            )}
            <Field label={L.firstName} htmlFor="first_name" required error={errors.first_name?.message}>
              <Input id="first_name" autoComplete="given-name" {...register("first_name", { required: "Required" })} />
            </Field>
            {fieldConfig.show_middle_name && (
              <Field label={L.middleName} htmlFor="middle_name">
                <Input id="middle_name" autoComplete="off" {...register("middle_name")} />
              </Field>
            )}
            <Field label={L.lastName} htmlFor="last_name" required error={errors.last_name?.message}>
              <Input id="last_name" autoComplete="family-name" {...register("last_name", { required: "Required" })} />
            </Field>
          </FieldGrid>

          <FieldGrid cols={1} className={fieldConfig.show_contact_no ? "sm:grid-cols-2" : undefined}>
            <Field label={L.email} htmlFor="email" required error={errors.email?.message}>
              <Input id="email" type="email" inputMode="email" autoComplete="email" {...register("email", { required: "Required" })} />
            </Field>
            {fieldConfig.show_contact_no && (
              <Field label={L.contactNo} htmlFor="contact_no" hint={L.contactNoHint}>
                <Input id="contact_no" type="tel" inputMode="tel" autoComplete="tel" {...register("contact_no")} />
              </Field>
            )}
          </FieldGrid>

          <Field label={L.institutionType} required>
            <Select value={instType} onValueChange={(v) => handleInstTypeChange(v as "school" | "college")}>
              <SelectTrigger>
                <SelectValue placeholder="Select" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="school">School (Std 1–12)</SelectItem>
                <SelectItem value="college">College (degree / diploma)</SelectItem>
              </SelectContent>
            </Select>
          </Field>

          {instType && (
            <Field
              label={L.institution}
              required
              error={errors.institution_id?.message}
            >
              <Select value={institutionId} onValueChange={handleInstitutionChange}>
                <SelectTrigger>
                  <SelectValue placeholder="Select your institution" />
                </SelectTrigger>
                <SelectContent>
                  {availableInstitutions.map((i) => (
                    <SelectItem key={i.id} value={i.id}>
                      {i.name}
                    </SelectItem>
                  ))}
                  <SelectItem value={OTHER}>Other — not listed</SelectItem>
                </SelectContent>
              </Select>
            </Field>
          )}

          {isOtherInstitution && (
            <Field label={L.otherInstitutionName} htmlFor="other_institution_name" required error={errors.other_institution_name?.message}>
              <Input id="other_institution_name" autoComplete="off" {...register("other_institution_name")} />
            </Field>
          )}

          {/* Every listed institution already carries a board, filled in
              silently on selection above — only asked directly when there's
              no institution row to read it from (Other), or that row simply
              never had one set. */}
          {needsBoardInput && (
            <>
              <Field label={L.board} required error={errors.board_id?.message}>
                <Select value={watch("board_id")} onValueChange={(v) => setValue("board_id", v, { shouldValidate: true })}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select board" />
                  </SelectTrigger>
                  <SelectContent>
                    {options.boards.map((b) => (
                      <SelectItem key={b.id} value={b.id}>
                        {b.name}
                      </SelectItem>
                    ))}
                    <SelectItem value={OTHER}>Other — not listed</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              {watch("board_id") === OTHER && (
                <Field label={L.otherBoardName} htmlFor="other_board_name" required error={errors.other_board_name?.message}>
                  <Input id="other_board_name" autoComplete="off" {...register("other_board_name")} />
                </Field>
              )}
            </>
          )}

          {/* Same idea for medium — skipped when the institution teaches in
              one clear language, asked when it's "Both", unlisted, or unset. */}
          {needsMediumInput && (
            <FieldGrid>
              <Field label={L.medium} required error={errors.medium_id?.message}>
                <Select value={watch("medium_id")} onValueChange={(v) => setValue("medium_id", v, { shouldValidate: true })}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select medium" />
                  </SelectTrigger>
                  <SelectContent>
                    {options.mediums.map((m) => (
                      <SelectItem key={m.id} value={m.id}>
                        {m.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            </FieldGrid>
          )}

          {isCollege ? (
            <>
              <FieldGrid>
                <Field label={L.course} required error={errors.standard_id?.message}>
                  <Select value={courseId} onValueChange={(v) => setValue("course_id", v)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select course" />
                    </SelectTrigger>
                    <SelectContent>
                      {options.courses.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.name}
                        </SelectItem>
                      ))}
                      <SelectItem value={OTHER}>Other — not listed</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
                {!isOtherCourse && (
                  <Field
                    label={course?.structure_type === "semester" ? L.semester : L.year}
                    required
                    error={errors.period_no?.message}
                    hint={course ? `1 to ${course.total_periods}` : "Select a course first"}
                  >
                    <Select value={watch("period_no")} onValueChange={(v) => setValue("period_no", v)} disabled={!course}>
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
                )}
              </FieldGrid>

              {isOtherCourse && (
                <>
                  <Field label="Your course name" htmlFor="other_course_name" required error={errors.other_course_name?.message}>
                    <Input id="other_course_name" autoComplete="off" {...register("other_course_name")} />
                  </Field>
                  <FieldGrid>
                    <Field label="Is it year-based or semester-based?" required error={errors.other_course_structure?.message}>
                      <Select
                        value={watch("other_course_structure")}
                        onValueChange={(v) => setValue("other_course_structure", v as "year" | "semester")}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="year">Year</SelectItem>
                          <SelectItem value="semester">Semester</SelectItem>
                        </SelectContent>
                      </Select>
                    </Field>
                    <Field
                      label={watch("other_course_structure") === "semester" ? "Current semester" : "Current year"}
                      htmlFor="other_period_no"
                      required
                      error={errors.period_no?.message}
                    >
                      <Input
                        id="other_period_no"
                        type="number"
                        inputMode="numeric"
                        min={1}
                        max={12}
                        className="tabular"
                        {...register("period_no")}
                      />
                    </Field>
                  </FieldGrid>
                </>
              )}
            </>
          ) : (
            instType === "school" && (
              <Field label={L.standard} required error={errors.standard_id?.message} hint={!institutionId ? "Select your institution first" : undefined}>
                <Select value={watch("standard_id")} onValueChange={(v) => setValue("standard_id", v)} disabled={!institutionId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select standard" />
                  </SelectTrigger>
                  <SelectContent>
                    {options.standards.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            )
          )}

          {fieldConfig.show_roll_no && (
            <Field label={L.rollNo} htmlFor="roll_no">
              <Input id="roll_no" autoComplete="off" {...register("roll_no")} />
            </Field>
          )}

          <FieldGrid>
            <Field label={L.percentage} htmlFor="percentage" error={errors.percentage?.message}>
              <Input
                id="percentage"
                type="number"
                inputMode="decimal"
                min={0}
                max={100}
                step="0.01"
                className="tabular"
                {...register("percentage")}
              />
            </Field>
            <Field label={L.grade} htmlFor="grade">
              <Input id="grade" autoComplete="off" {...register("grade")} />
            </Field>
          </FieldGrid>

          {fieldConfig.show_notes && (
            <Field label={L.notes} htmlFor="notes" hint="Optional">
              <Textarea id="notes" rows={3} {...register("notes")} />
            </Field>
          )}

          {fieldConfig.show_attachments && (
            <div className="rounded-xl border-2 border-primary/30 bg-primary/[0.05] p-4">
              <Field
                label={L.attachments}
                required
                hint={`Required — this is your proof of the result above. Up to ${MAX_FILES} files, image/PDF/DOCX, 5MB each.`}
              >
                <div className="space-y-2">
                  {files.map((f, i) => (
                    <div
                      key={`${f.name}-${i}`}
                      className="flex items-center gap-2.5 rounded-md border bg-card px-3 py-2"
                    >
                      {f.type.startsWith("image/") ? (
                        <ImageIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
                      ) : (
                        <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                      )}
                      <span className="min-w-0 flex-1 truncate text-[13px]">{f.name}</span>
                      <span className="shrink-0 text-[11px] text-muted-foreground">
                        {(f.size / 1024 / 1024).toFixed(1)}MB
                      </span>
                      <button
                        type="button"
                        onClick={() => removeFile(i)}
                        className="shrink-0 rounded p-1 text-muted-foreground hover:bg-accent hover:text-destructive"
                        aria-label={`Remove ${f.name}`}
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}

                  {files.length < MAX_FILES && (
                    <label className="flex cursor-pointer items-center justify-center gap-2 rounded-lg border-2 border-dashed border-primary/40 bg-card px-4 py-5 text-center text-[13px] font-medium text-primary transition-colors hover:border-primary hover:bg-primary/10">
                      <Paperclip className="h-4 w-4" />
                      Add a marksheet (image, PDF or DOCX)
                      <input
                        ref={fileInputRef}
                        type="file"
                        className="sr-only"
                        accept="image/jpeg,image/png,image/webp,image/gif,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                        onChange={(e) => addFiles(e.target.files)}
                      />
                    </label>
                  )}

                  {fileError && <p className="text-[12px] font-medium text-destructive">{fileError}</p>}
                </div>
              </Field>
            </div>
          )}

          {serverError && (
            <p className="rounded-md bg-destructive/10 px-3 py-2 text-[13px] font-medium text-destructive">
              {serverError}
            </p>
          )}

          <Button type="submit" className="h-12 w-full text-base" disabled={busy}>
            {busy ? <Loader2 className="animate-spin" /> : <Send />}
            {uploading ? "Uploading attachments…" : isSubmitting ? "Submitting…" : L.submit}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
