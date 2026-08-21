"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import {
  AlertTriangle,
  Check,
  Copy,
  Download,
  FileText,
  Image as ImageIcon,
  Loader2,
  Paperclip,
  RefreshCw,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
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
import { QuickAddInstitution } from "@/components/form/quick-add-institution";
import { QuickAddCourse } from "@/components/form/quick-add-course";
import { QuickAddBoard } from "@/components/form/quick-add-board";
import {
  addSubmissionAttachment,
  approveSubmission,
  checkSubmissionDuplicates,
  deleteSubmissionAttachment,
  getAttachmentSignedUrl,
  rejectSubmission,
  replaceSubmissionAttachment,
  updateSubmission,
} from "@/lib/actions/submissions";
import { createClient } from "@/lib/supabase/client";
import { ATTACHMENTS_BUCKET, STUDENT_PHOTOS_BUCKET } from "@/lib/tables";
import { ALLOWED_ATTACHMENT_TYPES, MAX_ATTACHMENTS, MAX_ATTACHMENT_BYTES } from "@/lib/attachments";
import { MAX_SOURCE_IMAGE_BYTES, compressMarksheetImage } from "@/lib/image-compression";
import { formatDateTime } from "@/lib/utils";
import { SALUTATIONS } from "@/lib/types";
import type { Board, Course, Lookups, PublicSubmissionRow } from "@/lib/types";

type Values = {
  salutation: string;
  first_name: string;
  middle_name: string;
  last_name: string;
  email: string;
  contact_no: string;
  institution_id: string;
  board_id: string;
  medium_id: string;
  standard_id: string;
  course_id: string;
  period_no: string;
  roll_no: string;
  percentage: string;
  grade: string;
};

export function SubmissionReviewSheet({
  submission,
  lookups,
  onOpenChange,
}: {
  submission: PublicSubmissionRow | null;
  lookups: Lookups;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const [saving, setSaving] = React.useState(false);
  const [approving, setApproving] = React.useState(false);
  const [rejecting, setRejecting] = React.useState(false);
  const [rejectReason, setRejectReason] = React.useState("");
  const [showReject, setShowReject] = React.useState(false);
  const [duplicates, setDuplicates] = React.useState<string[]>([]);
  const [error, setError] = React.useState<string | null>(null);
  const [pendingInstitutions, setPendingInstitutions] = React.useState<Lookups["institutions"]>([]);
  const [pendingCourses, setPendingCourses] = React.useState<
    Pick<Course, "id" | "name" | "structure_type" | "total_periods">[]
  >([]);
  const [pendingBoards, setPendingBoards] = React.useState<Pick<Board, "id" | "name" | "applies_to">[]>([]);
  const [attachmentLoading, setAttachmentLoading] = React.useState<string | null>(null);
  // Kept as local state (not read straight off `submission.attachments`) so
  // add/replace/delete reflect instantly — the sheet's `submission` prop is a
  // stale object reference from the list until the parent re-renders it.
  const [attachments, setAttachments] = React.useState<NonNullable<PublicSubmissionRow["attachments"]>>([]);
  const [addingFile, setAddingFile] = React.useState(false);
  const [mutatingAttachmentId, setMutatingAttachmentId] = React.useState<string | null>(null);
  const [pendingFileAction, setPendingFileAction] = React.useState<
    { type: "add" } | { type: "replace"; id: string } | null
  >(null);
  const attachmentInputRef = React.useRef<HTMLInputElement | null>(null);

  const { register, handleSubmit, watch, setValue, reset, formState: { errors } } = useForm<Values>();

  const institutions = [...lookups.institutions, ...pendingInstitutions];
  const courses = [...lookups.courses, ...pendingCourses];
  const boards = [...lookups.boards, ...pendingBoards];

  const institutionId = watch("institution_id");
  const courseId = watch("course_id");
  const standardId = watch("standard_id");
  const boardId = watch("board_id");
  const mediumId = watch("medium_id");
  const institution = institutions.find((i) => i.id === institutionId);
  const isCollege = institution?.type === "college" || (!institution && Boolean(submission?.course_id || submission?.other_course_name));
  const course = courses.find((c) => c.id === courseId);
  const isPending = submission?.status === "pending";

  const needsInstitutionResolve = isPending && !institutionId && Boolean(submission?.other_institution_name);
  const needsCourseResolve = isPending && !courseId && !standardId && Boolean(submission?.other_course_name);
  const needsBoardResolve = isPending && Boolean(standardId) && !boardId && Boolean(submission?.other_board_name);
  const needsMediumResolve = isPending && Boolean(standardId) && !mediumId;
  const canApprove = isPending && !needsInstitutionResolve && !needsCourseResolve && !needsBoardResolve && !needsMediumResolve;

  async function downloadAttachment(id: string) {
    setAttachmentLoading(id);
    const result = await getAttachmentSignedUrl(id);
    setAttachmentLoading(null);
    if (!result.ok) {
      toast.error("Could not open file", { description: result.error });
      return;
    }
    window.open(result.data.url, "_blank", "noopener,noreferrer");
  }

  function validateFileType(file: File): string | null {
    if (!ALLOWED_ATTACHMENT_TYPES.includes(file.type)) return `${file.name}: only images, PDF or DOCX are allowed`;
    const isImage = file.type.startsWith("image/");
    const cap = isImage ? MAX_SOURCE_IMAGE_BYTES : MAX_ATTACHMENT_BYTES;
    if (file.size > cap) return `${file.name}: must be ${Math.round(cap / (1024 * 1024))}MB or smaller`;
    return null;
  }

  /** Compresses an image attachment before it ever reaches Storage; PDF/DOCX
   *  pass through untouched. Returns null (with a toast already shown) if the
   *  file is invalid or compression itself fails, so callers just bail out
   *  without uploading anything. */
  async function prepareFile(file: File): Promise<File | null> {
    const invalid = validateFileType(file);
    if (invalid) {
      toast.error(invalid);
      return null;
    }
    if (!file.type.startsWith("image/")) return file;
    try {
      return await compressMarksheetImage(file);
    } catch {
      toast.error(`${file.name}: could not process this image — try a different file`);
      return null;
    }
  }

  function uploadPath(submissionId: string, file: File) {
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    return `${submissionId}/${crypto.randomUUID()}-${safeName}`;
  }

  async function handleAddFile(file: File) {
    if (!submission) return;
    if (attachments.length >= MAX_ATTACHMENTS) {
      toast.error(`Maximum ${MAX_ATTACHMENTS} attachments per application`);
      return;
    }

    setAddingFile(true);
    const prepared = await prepareFile(file);
    if (!prepared) {
      setAddingFile(false);
      return;
    }

    const path = uploadPath(submission.id, prepared);
    const supabase = createClient();
    const upload = await supabase.storage
      .from(ATTACHMENTS_BUCKET)
      .upload(path, prepared, { contentType: prepared.type });
    if (upload.error) {
      toast.error("Upload failed", { description: upload.error.message });
      setAddingFile(false);
      return;
    }

    const result = await addSubmissionAttachment({
      submissionId: submission.id,
      filePath: path,
      fileName: prepared.name,
      mimeType: prepared.type,
      sizeBytes: prepared.size,
    });
    setAddingFile(false);
    if (!result.ok) {
      toast.error("Could not attach file", { description: result.error });
      return;
    }

    setAttachments((prev) => [
      ...prev,
      {
        id: result.data.id,
        submission_id: submission.id,
        file_path: path,
        file_name: prepared.name,
        mime_type: prepared.type,
        size_bytes: prepared.size,
        created_at: new Date().toISOString(),
      },
    ]);
    toast.success("Attachment added");
    router.refresh();
  }

  async function handleReplaceFile(attachmentId: string, file: File) {
    if (!submission) return;

    setMutatingAttachmentId(attachmentId);
    const prepared = await prepareFile(file);
    if (!prepared) {
      setMutatingAttachmentId(null);
      return;
    }

    const path = uploadPath(submission.id, prepared);
    const supabase = createClient();
    const upload = await supabase.storage
      .from(ATTACHMENTS_BUCKET)
      .upload(path, prepared, { contentType: prepared.type });
    if (upload.error) {
      toast.error("Upload failed", { description: upload.error.message });
      setMutatingAttachmentId(null);
      return;
    }

    const result = await replaceSubmissionAttachment({
      id: attachmentId,
      filePath: path,
      fileName: prepared.name,
      mimeType: prepared.type,
      sizeBytes: prepared.size,
    });
    setMutatingAttachmentId(null);
    if (!result.ok) {
      toast.error("Could not replace file", { description: result.error });
      return;
    }

    setAttachments((prev) =>
      prev.map((a) =>
        a.id === attachmentId
          ? { ...a, file_path: path, file_name: prepared.name, mime_type: prepared.type, size_bytes: prepared.size }
          : a,
      ),
    );
    toast.success("Attachment replaced");
    router.refresh();
  }

  async function handleDeleteAttachment(id: string) {
    setMutatingAttachmentId(id);
    const result = await deleteSubmissionAttachment(id);
    setMutatingAttachmentId(null);
    if (!result.ok) {
      toast.error("Could not remove attachment", { description: result.error });
      return;
    }
    setAttachments((prev) => prev.filter((a) => a.id !== id));
    toast.success("Attachment removed");
    router.refresh();
  }

  function onFileInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    const action = pendingFileAction;
    setPendingFileAction(null);
    if (!file || !action) return;
    if (action.type === "add") void handleAddFile(file);
    else void handleReplaceFile(action.id, file);
  }

  React.useEffect(() => {
    if (!submission) return;
    setShowReject(false);
    setRejectReason("");
    setError(null);
    setPendingInstitutions([]);
    setPendingCourses([]);
    setPendingBoards([]);
    setAttachments(submission.attachments ?? []);
    reset({
      salutation: submission.salutation ?? "",
      first_name: submission.first_name,
      middle_name: submission.middle_name ?? "",
      last_name: submission.last_name,
      email: submission.email ?? "",
      contact_no: submission.contact_no ?? "",
      institution_id: submission.institution_id ?? "",
      board_id: submission.board_id ?? "",
      medium_id: submission.medium_id ?? "",
      standard_id: submission.standard_id ?? "",
      course_id: submission.course_id ?? "",
      period_no: submission.period_no ? String(submission.period_no) : "",
      roll_no: submission.roll_no ?? "",
      percentage: submission.percentage !== null ? String(submission.percentage) : "",
      grade: submission.grade ?? "",
    });

    checkSubmissionDuplicates({
      first_name: submission.first_name,
      middle_name: submission.middle_name,
      last_name: submission.last_name,
    }).then((r) => setDuplicates(r.ok ? r.data : []));
  }, [submission, reset]);

  function copyCode() {
    if (!submission) return;
    navigator.clipboard?.writeText(submission.reference_code).then(() => toast.success("Copied"), () => {});
  }

  async function saveDraft(values: Values) {
    if (!submission) return false;
    setSaving(true);
    const result = await updateSubmission({
      id: submission.id,
      salutation: values.salutation || undefined,
      first_name: values.first_name,
      middle_name: values.middle_name || undefined,
      last_name: values.last_name,
      email: values.email,
      contact_no: values.contact_no,
      institution_id: values.institution_id || null,
      // Not editable in this form — pass through as-is so saving never wipes
      // the applicant's original free-text "Other" answer out from under the
      // resolve banner above.
      other_institution_name: submission.other_institution_name ?? undefined,
      board_id: values.board_id || null,
      other_board_name: submission.other_board_name ?? undefined,
      medium_id: values.medium_id || null,
      standard_id: values.standard_id || null,
      course_id: values.course_id || null,
      other_course_name: submission.other_course_name ?? undefined,
      other_course_structure: submission.other_course_structure ?? undefined,
      period_no: values.period_no ? Number(values.period_no) : null,
      roll_no: values.roll_no || undefined,
      percentage: values.percentage,
      grade: values.grade,
      notes: submission.notes ?? undefined,
    });
    setSaving(false);
    if (!result.ok) {
      setError(result.fieldErrors ? Object.values(result.fieldErrors).flat().join(" · ") : result.error);
      return false;
    }
    return true;
  }

  async function onApprove(values: Values) {
    const saved = await saveDraft(values);
    if (!saved || !submission) return;
    setApproving(true);
    const result = await approveSubmission(submission.id);
    setApproving(false);
    if (!result.ok) {
      toast.error("Could not approve", { description: result.error });
      return;
    }
    toast.success("Approved — added to the roster");
    router.refresh();
    onOpenChange(false);
  }

  async function onReject() {
    if (!submission) return;
    setRejecting(true);
    const result = await rejectSubmission(submission.id, rejectReason || undefined);
    setRejecting(false);
    if (!result.ok) {
      toast.error("Could not reject", { description: result.error });
      return;
    }
    toast.success("Submission rejected");
    router.refresh();
    onOpenChange(false);
  }

  return (
    <Sheet open={Boolean(submission)} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-xl">
        {submission && (
          <form className="flex h-full flex-col">
            <SheetHeader>
              <SheetTitle className="flex flex-wrap items-center gap-2">
                Review application
                <Badge
                  variant={
                    submission.status === "approved"
                      ? "success"
                      : submission.status === "rejected"
                        ? "destructive"
                        : "warning"
                  }
                >
                  {submission.status}
                </Badge>
                <button
                  type="button"
                  onClick={copyCode}
                  className="ml-auto flex items-center gap-1.5 rounded-md border bg-muted/40 px-2 py-1 font-mono text-[12px] font-medium hover:bg-muted/70"
                  title="Copy reference code"
                >
                  {submission.reference_code}
                  <Copy className="h-3 w-3 text-muted-foreground" />
                </button>
              </SheetTitle>
              <SheetDescription>Submitted {formatDateTime(submission.created_at)}</SheetDescription>
            </SheetHeader>

            <SheetBody className="space-y-5">
              {duplicates.length > 0 && (
                <div className="rounded-lg border border-warning/40 bg-warning/8 p-3.5">
                  <p className="flex items-center gap-2 text-[13px] font-semibold text-warning">
                    <AlertTriangle className="h-4 w-4" /> Possible existing student
                  </p>
                  <p className="mt-1 text-[12px] text-muted-foreground">
                    Approving will match into: {duplicates.join(", ")}
                  </p>
                </div>
              )}

              <FieldGrid cols={1} className="sm:grid-cols-4">
                <Field label="Salutation" htmlFor="rs">
                  <Select value={watch("salutation")} onValueChange={(v) => setValue("salutation", v)} disabled={!isPending}>
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
                <Field label="First name" htmlFor="rf" required error={errors.first_name?.message}>
                  <Input id="rf" disabled={!isPending} {...register("first_name", { required: "Required" })} />
                </Field>
                <Field label="Middle" htmlFor="rm">
                  <Input id="rm" disabled={!isPending} {...register("middle_name")} />
                </Field>
                <Field label="Last name" htmlFor="rl" required error={errors.last_name?.message}>
                  <Input id="rl" disabled={!isPending} {...register("last_name", { required: "Required" })} />
                </Field>
              </FieldGrid>

              <FieldGrid>
                <Field label="Email" htmlFor="re" required error={errors.email?.message}>
                  <Input id="re" type="email" disabled={!isPending} {...register("email", { required: "Required" })} />
                </Field>
                <Field label="Contact no" htmlFor="rc" required error={errors.contact_no?.message}>
                  <Input id="rc" disabled={!isPending} {...register("contact_no", { required: "Required" })} />
                </Field>
              </FieldGrid>

              <Field label="Photograph">
                <span className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-lg border bg-muted/30">
                  {submission.photo_path ? (
                    // eslint-disable-next-line @next/next/no-img-element -- external Supabase Storage URL
                    <img
                      src={createClient().storage.from(STUDENT_PHOTOS_BUCKET).getPublicUrl(submission.photo_path).data.publicUrl}
                      alt="Applicant's photograph"
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <ImageIcon className="h-6 w-6 text-muted-foreground" />
                  )}
                </span>
              </Field>

              {needsInstitutionResolve && (
                <div className="rounded-lg border border-warning/40 bg-warning/8 p-3.5">
                  <p className="flex items-center gap-2 text-[13px] font-semibold text-warning">
                    <AlertTriangle className="h-4 w-4" /> Applicant typed a custom institution
                  </p>
                  <p className="mt-1 text-[12px] text-muted-foreground">
                    &quot;{submission.other_institution_name}&quot; — match it to an existing institution below, or
                    add it as new.
                  </p>
                </div>
              )}

              <Field label="Institution" required>
                <div className="flex gap-2">
                  <Select
                    value={institutionId}
                    onValueChange={(v) => setValue("institution_id", v)}
                    disabled={!isPending}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select institution" />
                    </SelectTrigger>
                    <SelectContent>
                      {institutions.map((i) => (
                        <SelectItem key={i.id} value={i.id}>
                          {i.name} · {i.type === "college" ? "College" : "School"}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {isPending && needsInstitutionResolve && (
                    <QuickAddInstitution
                      instType="school"
                      boardId=""
                      boardName=""
                      mediums={lookups.mediums}
                      onCreated={(inst) => {
                        setPendingInstitutions((p) => [...p, inst]);
                        setValue("institution_id", inst.id);
                      }}
                    />
                  )}
                </div>
              </Field>

              {Boolean(standardId) && (
                <>
                  {needsBoardResolve && (
                    <div className="rounded-lg border border-warning/40 bg-warning/8 p-3.5">
                      <p className="flex items-center gap-2 text-[13px] font-semibold text-warning">
                        <AlertTriangle className="h-4 w-4" /> Applicant typed a custom board
                      </p>
                      <p className="mt-1 text-[12px] text-muted-foreground">
                        &quot;{submission.other_board_name}&quot; — match it to an existing board below, or add
                        it as new.
                      </p>
                    </div>
                  )}
                  <Field label="Board" required>
                    <div className="flex gap-2">
                      <Select value={boardId} onValueChange={(v) => setValue("board_id", v)} disabled={!isPending}>
                        <SelectTrigger>
                          <SelectValue placeholder="Select board" />
                        </SelectTrigger>
                        <SelectContent>
                          {boards.map((b) => (
                            <SelectItem key={b.id} value={b.id}>
                              {b.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {isPending && needsBoardResolve && (
                        <QuickAddBoard
                          defaultName={submission.other_board_name ?? ""}
                          onCreated={(b) => {
                            setPendingBoards((p) => [...p, b]);
                            setValue("board_id", b.id);
                          }}
                        />
                      )}
                    </div>
                  </Field>
                  <Field label="Medium of instruction" required>
                    <Select value={watch("medium_id")} onValueChange={(v) => setValue("medium_id", v)} disabled={!isPending}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select medium" />
                      </SelectTrigger>
                      <SelectContent>
                        {lookups.mediums.map((m) => (
                          <SelectItem key={m.id} value={m.id}>
                            {m.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                </>
              )}

              {needsCourseResolve && (
                <div className="rounded-lg border border-warning/40 bg-warning/8 p-3.5">
                  <p className="flex items-center gap-2 text-[13px] font-semibold text-warning">
                    <AlertTriangle className="h-4 w-4" /> Applicant typed a custom course
                  </p>
                  <p className="mt-1 text-[12px] text-muted-foreground">
                    &quot;{submission.other_course_name}&quot; ({submission.other_course_structure}, period{" "}
                    {submission.period_no}) — match it to an existing course below, or add it as new.
                  </p>
                </div>
              )}

              {isCollege ? (
                <FieldGrid>
                  <Field label="Course">
                    <div className="flex gap-2">
                      <Select value={courseId} onValueChange={(v) => setValue("course_id", v)} disabled={!isPending}>
                        <SelectTrigger>
                          <SelectValue placeholder="Select course" />
                        </SelectTrigger>
                        <SelectContent>
                          {courses.map((c) => (
                            <SelectItem key={c.id} value={c.id}>
                              {c.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {isPending && needsCourseResolve && (
                        <QuickAddCourse
                          defaultName={submission.other_course_name ?? ""}
                          defaultStructure={submission.other_course_structure}
                          defaultTotalPeriods={submission.period_no}
                          onCreated={(c) => {
                            setPendingCourses((p) => [...p, c]);
                            setValue("course_id", c.id);
                          }}
                        />
                      )}
                    </div>
                  </Field>
                  <Field label={course?.structure_type === "semester" ? "Semester" : "Year"}>
                    <Select value={watch("period_no")} onValueChange={(v) => setValue("period_no", v)} disabled={!isPending || !course}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select" />
                      </SelectTrigger>
                      <SelectContent>
                        {Array.from({ length: course?.total_periods ?? 12 }, (_, i) => i + 1).map((n) => (
                          <SelectItem key={n} value={String(n)}>
                            {n}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                </FieldGrid>
              ) : (
                <Field label="Standard">
                  <Select value={watch("standard_id")} onValueChange={(v) => setValue("standard_id", v)} disabled={!isPending}>
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
                <Field label="Roll / GR no" htmlFor="rr">
                  <Input id="rr" disabled={!isPending} {...register("roll_no")} />
                </Field>
                <Field label="Percentage" htmlFor="rp" hint="Self-reported by applicant">
                  <Input id="rp" type="number" min={0} max={100} step="0.01" className="tabular" disabled={!isPending} {...register("percentage")} />
                </Field>
              </FieldGrid>
              <Field label="Grade" htmlFor="rg">
                <Input id="rg" disabled={!isPending} {...register("grade")} />
              </Field>

              {submission.notes && (
                <Field label="Applicant's note">
                  <p className="rounded-md border bg-muted/30 px-3 py-2.5 text-[13px] leading-relaxed whitespace-pre-wrap">
                    {submission.notes}
                  </p>
                </Field>
              )}

              <Field label="Attachments" hint={`Up to ${MAX_ATTACHMENTS}; photos resized automatically, PDF/DOCX up to 5MB each`}>
                <input
                  ref={attachmentInputRef}
                  type="file"
                  className="sr-only"
                  accept={ALLOWED_ATTACHMENT_TYPES.join(",")}
                  onChange={onFileInputChange}
                />

                {attachments.length === 0 ? (
                  <p className="text-[13px] text-muted-foreground">No attachments.</p>
                ) : (
                  <ul className="space-y-2">
                    {attachments.map((a) => {
                      const busy = mutatingAttachmentId === a.id;
                      return (
                        <li
                          key={a.id}
                          className="flex items-center gap-2.5 rounded-md border bg-muted/30 px-3 py-2"
                        >
                          {a.mime_type.startsWith("image/") ? (
                            <ImageIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
                          ) : (
                            <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                          )}
                          <span className="min-w-0 flex-1 truncate text-[13px]">{a.file_name}</span>
                          <span className="shrink-0 text-[11px] text-muted-foreground">
                            {(a.size_bytes / 1024 / 1024).toFixed(1)}MB
                          </span>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-sm"
                            disabled={attachmentLoading === a.id}
                            onClick={() => void downloadAttachment(a.id)}
                            aria-label={`Download ${a.file_name}`}
                            title="Download"
                          >
                            {attachmentLoading === a.id ? <Loader2 className="animate-spin" /> : <Download />}
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-sm"
                            disabled={busy}
                            onClick={() => {
                              setPendingFileAction({ type: "replace", id: a.id });
                              attachmentInputRef.current?.click();
                            }}
                            aria-label={`Replace ${a.file_name}`}
                            title="Replace file"
                          >
                            {busy ? <Loader2 className="animate-spin" /> : <RefreshCw />}
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-sm"
                            disabled={busy}
                            onClick={() => void handleDeleteAttachment(a.id)}
                            aria-label={`Delete ${a.file_name}`}
                            title="Delete"
                          >
                            {busy ? <Loader2 className="animate-spin" /> : <Trash2 className="text-destructive" />}
                          </Button>
                        </li>
                      );
                    })}
                  </ul>
                )}

                {attachments.length < MAX_ATTACHMENTS && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="mt-2"
                    disabled={addingFile}
                    onClick={() => {
                      setPendingFileAction({ type: "add" });
                      attachmentInputRef.current?.click();
                    }}
                  >
                    {addingFile ? <Loader2 className="animate-spin" /> : <Paperclip />}
                    Add attachment
                  </Button>
                )}
              </Field>

              {submission.status === "rejected" && submission.rejection_reason && (
                <p className="text-[13px] text-muted-foreground">
                  Rejection reason: {submission.rejection_reason}
                </p>
              )}

              {showReject && (
                <Field label="Rejection reason (optional)" htmlFor="reason">
                  <Textarea id="reason" rows={2} value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} />
                </Field>
              )}

              {error && (
                <p className="rounded-md bg-destructive/10 px-3 py-2 text-[13px] font-medium text-destructive">
                  {error}
                </p>
              )}
            </SheetBody>

            {isPending && (
              <SheetFooter className="flex-wrap justify-between">
                {!showReject ? (
                  <Button type="button" variant="outline" onClick={() => setShowReject(true)}>
                    <X /> Reject
                  </Button>
                ) : (
                  <div className="flex gap-2">
                    <Button type="button" variant="ghost" onClick={() => setShowReject(false)}>
                      Cancel
                    </Button>
                    <Button type="button" variant="destructive" onClick={() => void onReject()} disabled={rejecting}>
                      {rejecting ? <Loader2 className="animate-spin" /> : <X />}
                      Confirm reject
                    </Button>
                  </div>
                )}

                {!showReject && (
                  <div className="flex gap-2">
                    <Button type="button" variant="outline" onClick={handleSubmit(saveDraft)} disabled={saving}>
                      {saving && <Loader2 className="animate-spin" />}
                      Save changes
                    </Button>
                    <Button
                      type="button"
                      onClick={handleSubmit(onApprove)}
                      disabled={approving || !canApprove}
                      title={!canApprove ? "Resolve the custom institution/course first" : undefined}
                    >
                      {approving ? <Loader2 className="animate-spin" /> : <Check />}
                      Approve
                    </Button>
                  </div>
                )}
              </SheetFooter>
            )}
          </form>
        )}
      </SheetContent>
    </Sheet>
  );
}
