"use client";

import * as React from "react";
import { Loader2, Plus } from "lucide-react";
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Field, FieldGrid } from "@/components/form/field";
import { saveConfig } from "@/lib/actions/settings";
import type { Course, CourseStructure } from "@/lib/types";

type CreatedCourse = Pick<Course, "id" | "name" | "structure_type" | "total_periods">;

/** Inline "add the course I can't find" — same pattern as QuickAddInstitution.
 *  Pre-fillable from a submission's free-text course name/structure so staff
 *  don't retype what the applicant already provided. */
export function QuickAddCourse({
  defaultName = "",
  defaultStructure,
  defaultTotalPeriods,
  onCreated,
}: {
  defaultName?: string;
  defaultStructure?: CourseStructure | null;
  defaultTotalPeriods?: number | null;
  onCreated: (course: CreatedCourse) => void;
}) {
  const [open, setOpen] = React.useState(false);
  const [name, setName] = React.useState(defaultName);
  const [structure, setStructure] = React.useState<CourseStructure>(defaultStructure ?? "year");
  const [totalPeriods, setTotalPeriods] = React.useState(
    String(defaultTotalPeriods ?? (defaultStructure === "semester" ? 8 : 4)),
  );
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!open) return;
    setName(defaultName);
    setStructure(defaultStructure ?? "year");
    setTotalPeriods(String(defaultTotalPeriods ?? (defaultStructure === "semester" ? 8 : 4)));
    setError(null);
  }, [open, defaultName, defaultStructure, defaultTotalPeriods]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      setError("Name is required");
      return;
    }

    setSaving(true);
    const result = await saveConfig("courses", {
      name: name.trim(),
      structure_type: structure,
      total_periods: totalPeriods,
    });
    setSaving(false);

    if (!result.ok) {
      setError(result.fieldErrors ? Object.values(result.fieldErrors).flat().join(" · ") : result.error);
      return;
    }

    toast.success(`${name.trim()} added`);
    onCreated({
      id: result.data.id,
      name: name.trim(),
      structure_type: structure,
      total_periods: Number(totalPeriods),
    });
    setOpen(false);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline" size="icon" title="Add a course" aria-label="Add course">
          <Plus className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={submit}>
          <DialogHeader>
            <DialogTitle>Add course</DialogTitle>
            <DialogDescription>Becomes available everywhere courses are picked.</DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <Field label="Name" htmlFor="quick-course-name" required>
              <Input
                id="quick-course-name"
                autoFocus
                autoComplete="off"
                placeholder="e.g. BSc Data Science"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </Field>

            <FieldGrid>
              <Field label="Structure" htmlFor="quick-course-structure">
                <Select value={structure} onValueChange={(v) => setStructure(v as CourseStructure)}>
                  <SelectTrigger id="quick-course-structure">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="year">Year-based</SelectItem>
                    <SelectItem value="semester">Semester-based</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Total years / semesters" htmlFor="quick-course-periods">
                <Input
                  id="quick-course-periods"
                  type="number"
                  min={1}
                  max={12}
                  className="tabular"
                  value={totalPeriods}
                  onChange={(e) => setTotalPeriods(e.target.value)}
                />
              </Field>
            </FieldGrid>

            {error && (
              <p className="rounded-md bg-destructive/10 px-3 py-2 text-[13px] font-medium text-destructive">
                {error}
              </p>
            )}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving && <Loader2 className="animate-spin" />}
              Add course
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
