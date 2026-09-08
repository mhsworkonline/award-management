"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetBody, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Field, FieldGrid } from "@/components/form/field";
import { bulkUpdateInstitutions } from "@/lib/actions/institutions";
import type { Institution, Lookups } from "@/lib/types";

type Values = {
  type: "" | "school" | "college";
  board_id: string;
  medium_id: string;
  city: string;
  contact_person: string;
  contact_no: string;
};

const EMPTY: Values = { type: "", board_id: "", medium_id: "", city: "", contact_person: "", contact_no: "" };

/** Bulk edit for the Institutions list: pick a value for any field here and
 *  it's applied to every selected institution — not just the one row you'd
 *  normally edit. Every field starts blank; a blank field is left alone on
 *  every row, so you only need to fill in what you actually want changed.
 *  Name is intentionally absent — see bulkUpdateInstitutions' doc comment. */
export function InstitutionBulkEditSheet({
  open,
  onOpenChange,
  selected,
  lookups,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selected: Institution[];
  lookups: Lookups;
}) {
  const router = useRouter();
  const [values, setValues] = React.useState<Values>(EMPTY);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (open) {
      setValues(EMPTY);
      setError(null);
    }
  }, [open]);

  const touchesBoardOrMedium = Boolean(values.board_id || values.medium_id);
  const schoolIds = selected.filter((i) => i.type === "school").map((i) => i.id);
  const nonSchoolIds = selected.filter((i) => i.type !== "school").map((i) => i.id);

  async function onSubmit() {
    setError(null);

    const patch: Parameters<typeof bulkUpdateInstitutions>[1] = {};
    if (values.type) patch.type = values.type;
    if (values.board_id) patch.board_id = values.board_id;
    if (values.medium_id) patch.medium_id = values.medium_id;
    if (values.city.trim()) patch.city = values.city.trim();
    if (values.contact_person.trim()) patch.contact_person = values.contact_person.trim();
    if (values.contact_no.trim()) patch.contact_no = values.contact_no.trim();

    if (Object.keys(patch).length === 0) {
      setError("Fill in at least one field to apply");
      return;
    }

    setSaving(true);

    // Board/medium only apply to schools. If type itself isn't also being
    // bulk-set, split the selection so any colleges in the batch aren't
    // handed a board/medium — two calls with the same shared values,
    // scoped to the ids they're actually valid for.
    const calls =
      touchesBoardOrMedium && !values.type
        ? [
            schoolIds.length ? bulkUpdateInstitutions(schoolIds, patch) : null,
            nonSchoolIds.length
              ? bulkUpdateInstitutions(nonSchoolIds, {
                  ...patch,
                  board_id: undefined,
                  medium_id: undefined,
                })
              : null,
          ].filter((c): c is ReturnType<typeof bulkUpdateInstitutions> => c !== null)
        : [bulkUpdateInstitutions(selected.map((i) => i.id), patch)];

    const results = await Promise.all(calls);
    setSaving(false);

    const failed = results.find((r) => !r.ok);
    if (failed && !failed.ok) {
      setError(failed.error);
      return;
    }

    const updated = results.reduce((sum, r) => sum + (r.ok ? r.data.updated : 0), 0);
    toast.success(`Updated ${updated} institution${updated === 1 ? "" : "s"}`);
    router.refresh();
    onOpenChange(false);
  }

  const availableBoards = lookups.boards.filter((b) => b.applies_to === "school" || b.applies_to === "both");

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-lg">
        <div className="flex h-full flex-col">
          <SheetHeader>
            <SheetTitle>Edit {selected.length} institution{selected.length === 1 ? "" : "s"}</SheetTitle>
            <SheetDescription>
              Only fields you fill in here are changed — everything left blank stays as it was on
              each institution.
            </SheetDescription>
          </SheetHeader>

          <SheetBody className="space-y-5">
            <Field label="Type" hint="Leave blank to keep each institution's current type">
              <Select value={values.type} onValueChange={(v) => setValues((p) => ({ ...p, type: v as Values["type"] }))}>
                <SelectTrigger>
                  <SelectValue placeholder="No change" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="school">School</SelectItem>
                  <SelectItem value="college">College</SelectItem>
                </SelectContent>
              </Select>
            </Field>

            <FieldGrid>
              <Field label="Board" hint="Applied to schools in the selection only">
                <Select value={values.board_id} onValueChange={(v) => setValues((p) => ({ ...p, board_id: v }))}>
                  <SelectTrigger>
                    <SelectValue placeholder="No change" />
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

              <Field label="Medium" hint="Applied to schools in the selection only">
                <Select value={values.medium_id} onValueChange={(v) => setValues((p) => ({ ...p, medium_id: v }))}>
                  <SelectTrigger>
                    <SelectValue placeholder="No change" />
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

            <FieldGrid>
              <Field label="City / town" htmlFor="bulk_city">
                <Input
                  id="bulk_city"
                  autoComplete="off"
                  placeholder="No change"
                  value={values.city}
                  onChange={(e) => setValues((p) => ({ ...p, city: e.target.value }))}
                />
              </Field>
              <Field label="Contact person" htmlFor="bulk_contact_person">
                <Input
                  id="bulk_contact_person"
                  autoComplete="off"
                  placeholder="No change"
                  value={values.contact_person}
                  onChange={(e) => setValues((p) => ({ ...p, contact_person: e.target.value }))}
                />
              </Field>
            </FieldGrid>

            <Field label="Contact no" htmlFor="bulk_contact_no">
              <Input
                id="bulk_contact_no"
                inputMode="tel"
                autoComplete="off"
                placeholder="No change"
                value={values.contact_no}
                onChange={(e) => setValues((p) => ({ ...p, contact_no: e.target.value }))}
              />
            </Field>

            {error && (
              <p className="rounded-md bg-destructive/10 px-3 py-2 text-[13px] font-medium text-destructive">
                {error}
              </p>
            )}
          </SheetBody>

          <SheetFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="button" onClick={() => void onSubmit()} disabled={saving}>
              {saving && <Loader2 className="animate-spin" />}
              Apply to {selected.length} institution{selected.length === 1 ? "" : "s"}
            </Button>
          </SheetFooter>
        </div>
      </SheetContent>
    </Sheet>
  );
}
