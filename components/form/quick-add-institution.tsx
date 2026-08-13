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
import type { Institution, InstitutionType, Medium } from "@/lib/types";

type CreatedInstitution = Pick<Institution, "id" | "name" | "type" | "board_id" | "medium_id">;

/** Inline "add the institution I can't find" — scoped to whichever board and
 *  type are already selected in the cascade above it, so the new row slots
 *  straight into the right place instead of asking the operator to redo the
 *  classification on a separate page. */
export function QuickAddInstitution({
  instType,
  boardId,
  boardName,
  mediums,
  onCreated,
}: {
  instType: "school" | "college" | "";
  boardId: string;
  boardName: string;
  mediums: Medium[];
  onCreated: (institution: CreatedInstitution) => void;
}) {
  const [open, setOpen] = React.useState(false);
  const [name, setName] = React.useState("");
  const [mediumId, setMediumId] = React.useState("");
  const [city, setCity] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const needsBoard = instType === "school";
  const ready = Boolean(instType && (!needsBoard || boardId));

  React.useEffect(() => {
    if (!open) return;
    setName("");
    setMediumId("");
    setCity("");
    setError(null);
  }, [open]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!ready) return;
    if (!name.trim()) {
      setError("Name is required");
      return;
    }

    setSaving(true);
    const result = await saveConfig("institutions", {
      name: name.trim(),
      type: instType as InstitutionType,
      board_id: needsBoard ? boardId : undefined,
      medium_id: needsBoard ? mediumId || undefined : undefined,
      city: city.trim() || undefined,
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
      type: instType as InstitutionType,
      board_id: needsBoard ? boardId : null,
      medium_id: needsBoard ? mediumId || null : null,
    });
    setOpen(false);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="icon"
          disabled={!ready}
          title={ready ? "Add an institution" : needsBoard ? "Select a type and board first" : "Select a type first"}
          aria-label="Add institution"
        >
          <Plus className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={submit}>
          <DialogHeader>
            <DialogTitle>Add institution</DialogTitle>
            <DialogDescription>
              {instType === "college" ? "College" : `School · ${boardName}`}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <Field label="Name" htmlFor="quick-inst-name" required>
              <Input
                id="quick-inst-name"
                autoFocus
                autoComplete="off"
                placeholder="e.g. Shree Vidyalaya High School"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </Field>

            <FieldGrid>
              {instType === "school" && (
                <Field label="Medium" htmlFor="quick-inst-medium">
                  <Select value={mediumId} onValueChange={setMediumId}>
                    <SelectTrigger id="quick-inst-medium">
                      <SelectValue placeholder="Select medium" />
                    </SelectTrigger>
                    <SelectContent>
                      {mediums.map((m) => (
                        <SelectItem key={m.id} value={m.id}>
                          {m.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
              )}
              <Field label="City / town" htmlFor="quick-inst-city">
                <Input
                  id="quick-inst-city"
                  autoComplete="off"
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
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
              Add institution
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
