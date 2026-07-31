"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, Search } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { saveAward } from "@/lib/actions/awards";
import { searchStudents, type RecordOption } from "@/lib/actions/search";
import type { Lookups } from "@/lib/types";

export function AwardSheet({
  open,
  onOpenChange,
  lookups,
  defaultYearId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  lookups: Lookups;
  defaultYearId: string | null;
}) {
  const router = useRouter();
  const [yearId, setYearId] = React.useState(defaultYearId ?? "");
  const [categoryId, setCategoryId] = React.useState("");
  const [criteria, setCriteria] = React.useState("");
  const [term, setTerm] = React.useState("");
  const [results, setResults] = React.useState<RecordOption[]>([]);
  const [selected, setSelected] = React.useState<RecordOption | null>(null);
  const [searching, setSearching] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!open) return;
    setYearId(defaultYearId ?? "");
    setCategoryId(lookups.awardCategories[0]?.id ?? "");
    setCriteria("");
    setTerm("");
    setResults([]);
    setSelected(null);
    setError(null);
  }, [open, defaultYearId, lookups.awardCategories]);

  React.useEffect(() => {
    if (!term.trim() || !yearId) {
      setResults([]);
      return;
    }
    const timer = window.setTimeout(async () => {
      setSearching(true);
      const result = await searchStudents({ academic_year_id: yearId, q: term });
      setSearching(false);
      setResults(result.ok ? result.data : []);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [term, yearId]);

  async function submit() {
    if (!selected || !categoryId || !yearId) return;
    setSaving(true);
    setError(null);

    const result = await saveAward({
      academic_record_id: selected.academic_record_id,
      award_category_id: categoryId,
      subject_or_criteria: criteria || undefined,
    });
    setSaving(false);

    if (!result.ok) {
      setError(result.error);
      return;
    }

    toast.success(`${selected.student_name} assigned ${categoryName(lookups, categoryId)}`);
    router.refresh();

    // Keep the sheet open — awards are entered in runs, category by category.
    setSelected(null);
    setTerm("");
    setResults([]);
    setCriteria("");
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>Assign award</SheetTitle>
          <SheetDescription>
            Find a student, pick the award category, then allocate a gift from the awards table.
          </SheetDescription>
        </SheetHeader>

        <SheetBody className="space-y-5">
          <FieldGrid>
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

            <Field label="Award category" required>
              <Select value={categoryId} onValueChange={setCategoryId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select category" />
                </SelectTrigger>
                <SelectContent>
                  {lookups.awardCategories.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </FieldGrid>

          <Field
            label="Student"
            required
            hint={
              selected
                ? undefined
                : yearId
                  ? "Type at least part of the student's name"
                  : "Select an academic year first"
            }
          >
            {selected ? (
              <div className="flex items-center justify-between gap-3 rounded-md border bg-muted/40 px-3 py-2.5">
                <div className="min-w-0">
                  <p className="truncate text-[13.5px] font-medium">{selected.student_name}</p>
                  <p className="truncate text-[12px] text-muted-foreground">
                    {selected.father_name ? `s/o ${selected.father_name} · ` : ""}
                    {selected.institution_name} · {selected.placement}
                  </p>
                </div>
                <Button variant="ghost" size="sm" onClick={() => setSelected(null)}>
                  Change
                </Button>
              </div>
            ) : (
              <>
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={term}
                    onChange={(e) => setTerm(e.target.value)}
                    placeholder="Search student name…"
                    className="pl-9"
                    disabled={!yearId}
                    autoFocus
                  />
                  {searching && (
                    <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />
                  )}
                </div>

                {term.trim() && (
                  <ul className="scrollbar-thin mt-2 max-h-56 overflow-y-auto rounded-md border">
                    {results.length === 0 ? (
                      <li className="px-3 py-3 text-[13px] text-muted-foreground">
                        {searching ? "Searching…" : "No students match that name for this year."}
                      </li>
                    ) : (
                      results.map((s) => (
                        <li key={s.academic_record_id}>
                          <button
                            type="button"
                            onClick={() => {
                              setSelected(s);
                              setTerm("");
                            }}
                            className="flex w-full items-center justify-between gap-3 border-b px-3 py-2 text-left last:border-b-0 hover:bg-accent focus-visible:bg-accent focus-visible:outline-none"
                          >
                            <span className="min-w-0">
                              <span className="block truncate text-[13.5px] font-medium">
                                {s.student_name}
                              </span>
                              <span className="block truncate text-[12px] text-muted-foreground">
                                {s.father_name ? `s/o ${s.father_name} · ` : ""}
                                {s.institution_name}
                              </span>
                            </span>
                            <Badge variant="outline">{s.placement}</Badge>
                          </button>
                        </li>
                      ))
                    )}
                  </ul>
                )}
              </>
            )}
          </Field>

          <Field
            label="Subject / criteria"
            htmlFor="criteria"
            hint="Optional — e.g. Mathematics, Overall, Sports"
          >
            <Input
              id="criteria"
              value={criteria}
              onChange={(e) => setCriteria(e.target.value)}
              autoComplete="off"
            />
          </Field>

          {error && (
            <p className="rounded-md bg-destructive/10 px-3 py-2 text-[13px] font-medium text-destructive">
              {error}
            </p>
          )}
        </SheetBody>

        <SheetFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Done
          </Button>
          <Button onClick={() => void submit()} disabled={!selected || !categoryId || saving}>
            {saving ? <Loader2 className="animate-spin" /> : <Check />}
            Assign award
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

function categoryName(lookups: Lookups, id: string) {
  return lookups.awardCategories.find((c) => c.id === id)?.name ?? "award";
}
