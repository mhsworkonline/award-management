"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { Field } from "@/components/form/field";
import { saveApplicationForm } from "@/lib/actions/application-forms";
import type { ApplicationFormRow, Lookups } from "@/lib/types";

type Values = { title: string; description: string; slug: string; academic_year_id: string };

function slugify(v: string) {
  return v
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

export function FormSheet({
  open,
  onOpenChange,
  form,
  lookups,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  form: ApplicationFormRow | null;
  lookups: Lookups;
}) {
  const router = useRouter();
  const isEdit = Boolean(form);
  const [slugTouched, setSlugTouched] = React.useState(false);
  const [serverError, setServerError] = React.useState<string | null>(null);

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<Values>({ defaultValues: { title: "", description: "", slug: "", academic_year_id: "" } });

  const title = watch("title");

  React.useEffect(() => {
    if (!open) return;
    setServerError(null);
    setSlugTouched(isEdit);
    reset(
      form
        ? {
            title: form.title,
            description: form.description ?? "",
            slug: form.slug,
            academic_year_id: form.academic_year_id,
          }
        : {
            title: "",
            description: "",
            slug: "",
            academic_year_id: lookups.academicYears.find((y) => y.is_active)?.id ?? "",
          },
    );
  }, [open, form, reset, lookups.academicYears]);

  React.useEffect(() => {
    if (slugTouched || isEdit) return;
    setValue("slug", slugify(title || ""));
  }, [title, slugTouched, isEdit, setValue]);

  async function onSubmit(values: Values) {
    setServerError(null);
    const result = await saveApplicationForm({ id: form?.id, ...values });
    if (!result.ok) {
      setServerError(result.fieldErrors ? Object.values(result.fieldErrors).flat().join(" · ") : result.error);
      return;
    }
    toast.success(isEdit ? "Form updated" : "Form created");
    router.refresh();
    onOpenChange(false);
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-md">
        <form onSubmit={handleSubmit(onSubmit)} className="flex h-full flex-col">
          <SheetHeader>
            <SheetTitle>{isEdit ? "Edit form" : "New application form"}</SheetTitle>
            <SheetDescription>
              A distinct, toggleable public link. Scoped to one academic year.
            </SheetDescription>
          </SheetHeader>

          <SheetBody className="space-y-5">
            <Field label="Title" htmlFor="title" required error={errors.title?.message}>
              <Input
                id="title"
                autoFocus
                autoComplete="off"
                placeholder="e.g. Award Application 2026-27"
                {...register("title", { required: "Required" })}
              />
            </Field>

            <Field
              label="Description shown to applicants"
              htmlFor="description"
              hint="Optional — shown under the title on the public form. Defaults to a standard message if left blank."
            >
              <Textarea
                id="description"
                rows={3}
                placeholder={`For ${lookups.academicYears.find((y) => y.id === watch("academic_year_id"))?.label ?? "this year"}. Fill in your details below — your institution will verify this before it's finalized.`}
                {...register("description")}
              />
            </Field>

            <Field
              label="Link slug"
              htmlFor="slug"
              required
              error={errors.slug?.message}
              hint={`/apply/${watch("slug") || "…"}`}
            >
              <Input
                id="slug"
                autoComplete="off"
                onChange={(e) => {
                  setSlugTouched(true);
                  setValue("slug", slugify(e.target.value));
                }}
                value={watch("slug")}
              />
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

            {serverError && (
              <p className="rounded-md bg-destructive/10 px-3 py-2 text-[13px] font-medium text-destructive">
                {serverError}
              </p>
            )}
          </SheetBody>

          <SheetFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting && <Loader2 className="animate-spin" />}
              {isEdit ? "Save changes" : "Create form"}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}
