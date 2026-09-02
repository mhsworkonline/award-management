"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { saveConfig } from "@/lib/actions/settings";
import type { Institution, InstitutionType, Lookups } from "@/lib/types";

type Values = {
  name: string;
  type: InstitutionType | "";
  board_id: string;
  medium_id: string;
  city: string;
  contact_person: string;
  contact_no: string;
};

const EMPTY: Values = {
  name: "",
  type: "",
  board_id: "",
  medium_id: "",
  city: "",
  contact_person: "",
  contact_no: "",
};

export function InstitutionSheet({
  open,
  onOpenChange,
  institution,
  lookups,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  institution: Institution | null;
  lookups: Lookups;
}) {
  const router = useRouter();
  const isEdit = Boolean(institution);
  const [serverError, setServerError] = React.useState<string | null>(null);

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<Values>({ defaultValues: EMPTY });

  const type = watch("type");
  const isSchool = type === "school";

  React.useEffect(() => {
    if (!open) return;
    setServerError(null);
    reset(
      institution
        ? {
            name: institution.name,
            type: institution.type,
            board_id: institution.board_id ?? "",
            medium_id: institution.medium_id ?? "",
            city: institution.city ?? "",
            contact_person: institution.contact_person ?? "",
            contact_no: institution.contact_no ?? "",
          }
        : EMPTY,
    );
  }, [open, institution, reset]);

  async function onSubmit(values: Values) {
    setServerError(null);

    const result = await saveConfig("institutions", {
      id: institution?.id,
      name: values.name,
      type: values.type,
      board_id: values.board_id || null,
      medium_id: values.medium_id || null,
      city: values.city || undefined,
      contact_person: values.contact_person || undefined,
      contact_no: values.contact_no || undefined,
    });

    if (!result.ok) {
      setServerError(
        result.fieldErrors ? Object.values(result.fieldErrors).flat().join(" · ") : result.error,
      );
      return;
    }

    toast.success(isEdit ? "Institution updated" : "Institution added");
    router.refresh();
    onOpenChange(false);
  }

  // Board and medium are both school-only; clear them if the type flips to college.
  React.useEffect(() => {
    if (type === "college") {
      setValue("medium_id", "");
      setValue("board_id", "");
    }
  }, [type, setValue]);

  const availableBoards = lookups.boards.filter((b) => b.applies_to === "school" || b.applies_to === "both");

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-lg">
        <form onSubmit={handleSubmit(onSubmit)} className="flex h-full flex-col">
          <SheetHeader>
            <SheetTitle>{isEdit ? "Edit institution" : "Add institution"}</SheetTitle>
            <SheetDescription>
              Board and medium apply to schools only.
            </SheetDescription>
          </SheetHeader>

          <SheetBody className="space-y-5">
            <Field label="Name" htmlFor="name" required error={errors.name?.message}>
              <Input
                id="name"
                autoFocus
                autoComplete="off"
                placeholder="e.g. Shree Vidyalaya High School"
                {...register("name", { required: "Name is required" })}
              />
            </Field>

            <Field label="Type" required error={errors.type?.message}>
              <Select
                value={type}
                onValueChange={(v) => setValue("type", v as InstitutionType, { shouldValidate: true })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="School or college" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="school">School (LKG–12)</SelectItem>
                  <SelectItem value="college">College (degree / diploma)</SelectItem>
                </SelectContent>
              </Select>
              <input type="hidden" {...register("type", { required: "Select a type" })} />
            </Field>

            {isSchool && (
              <FieldGrid>
                <Field label="Board">
                  <Select value={watch("board_id")} onValueChange={(v) => setValue("board_id", v)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select board" />
                    </SelectTrigger>
                    <SelectContent>
                      {availableBoards.map((b) => (
                        <SelectItem key={b.id} value={b.id}>
                          {b.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>

                <Field label="Medium">
                  <Select value={watch("medium_id")} onValueChange={(v) => setValue("medium_id", v)}>
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
              </FieldGrid>
            )}

            <FieldGrid>
              <Field label="City / town" htmlFor="city">
                <Input id="city" autoComplete="off" {...register("city")} />
              </Field>
              <Field label="Contact person" htmlFor="contact_person">
                <Input id="contact_person" autoComplete="off" {...register("contact_person")} />
              </Field>
            </FieldGrid>

            <Field label="Contact no" htmlFor="contact_no">
              <Input id="contact_no" inputMode="tel" autoComplete="off" {...register("contact_no")} />
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
              {isEdit ? "Save changes" : "Add institution"}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}
