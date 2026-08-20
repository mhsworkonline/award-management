"use client";

import * as React from "react";
import { Loader2, Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Field } from "@/components/form/field";
import { saveConfig } from "@/lib/actions/settings";
import type { Board } from "@/lib/types";

type CreatedBoard = Pick<Board, "id" | "name" | "applies_to">;

/** Inline "add the board I can't find" — same pattern as QuickAddInstitution/
 *  QuickAddCourse. Pre-fillable from a submission's free-text board name. */
export function QuickAddBoard({
  defaultName = "",
  onCreated,
}: {
  defaultName?: string;
  onCreated: (board: CreatedBoard) => void;
}) {
  const [open, setOpen] = React.useState(false);
  const [name, setName] = React.useState(defaultName);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!open) return;
    setName(defaultName);
    setError(null);
  }, [open, defaultName]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      setError("Name is required");
      return;
    }

    setSaving(true);
    const result = await saveConfig("boards", { name: name.trim(), applies_to: "school" });
    setSaving(false);

    if (!result.ok) {
      setError(result.fieldErrors ? Object.values(result.fieldErrors).flat().join(" · ") : result.error);
      return;
    }

    toast.success(`${name.trim()} added`);
    onCreated({ id: result.data.id, name: name.trim(), applies_to: "school" });
    setOpen(false);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline" size="icon" title="Add a board" aria-label="Add board">
          <Plus className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={submit}>
          <DialogHeader>
            <DialogTitle>Add board</DialogTitle>
            <DialogDescription>Becomes available everywhere boards are picked.</DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <Field label="Name" htmlFor="quick-board-name" required>
              <Input
                id="quick-board-name"
                autoFocus
                autoComplete="off"
                placeholder="e.g. Open School Board"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </Field>

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
              Add board
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
