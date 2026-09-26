"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2, Wand2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  applyPercentageAwards,
  previewPercentageAwards,
  type AssignmentSummary,
} from "@/lib/actions/award-assignment";
import { BAND_CATEGORY_NAMES, BAND_ORDER } from "@/lib/awards/percentage-rule";

/** "Assign Awards": runs the school award rule (Play Group to Std 12) for the year
 *  being viewed. It previews first — counts of what will be added, switched
 *  and skipped — and only changes anything once confirmed, since it overwrites
 *  existing rank/consolation awards. */
export function AssignAwardsButton({ yearId, yearLabel }: { yearId: string | null; yearLabel: string }) {
  const router = useRouter();
  const [loading, setLoading] = React.useState(false);
  const [running, setRunning] = React.useState(false);
  const [open, setOpen] = React.useState(false);
  const [summary, setSummary] = React.useState<AssignmentSummary | null>(null);

  async function openPreview() {
    if (!yearId) return;
    setLoading(true);
    const result = await previewPercentageAwards(yearId);
    setLoading(false);
    if (!result.ok) {
      toast.error("Could not check the awards", { description: result.error });
      return;
    }
    setSummary(result.data);
    setOpen(true);
  }

  async function run() {
    if (!yearId) return;
    setRunning(true);
    const result = await applyPercentageAwards(yearId);
    setRunning(false);
    if (!result.ok) {
      toast.error("Could not assign awards", { description: result.error });
      return;
    }
    const s = result.data;
    toast.success("Awards assigned", {
      description: `${s.toCreate} added, ${s.toChange} changed${s.skipped.count ? `, ${s.skipped.count} left for you to decide` : ""}.`,
      duration: 8000,
    });
    setOpen(false);
    router.refresh();
  }

  const nothingToDo = summary !== null && summary.toCreate + summary.toChange + summary.toRemove === 0;

  return (
    <>
      <Button variant="outline" onClick={() => void openPreview()} disabled={!yearId || loading}>
        {loading ? <Loader2 className="animate-spin" /> : <Wand2 />} Assign Awards
      </Button>

      <Dialog open={open} onOpenChange={(o) => !running && setOpen(o)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Assign awards for {yearLabel}?</DialogTitle>
            <DialogDescription>
              Play Group, Nursery, LKG and UKG all get Consolation. Std 1 to Std 12, by percentage: 90+ gets 1st
              Rank, 80–89.99 gets 2nd Rank, 70–79.99 gets 3rd Rank, below 70 gets Consolation. No percentage and
              no grade gets Consolation.
            </DialogDescription>
          </DialogHeader>

          {summary && (
            <div className="space-y-3 text-[13px]">
              <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1.5">
                <dt className="text-muted-foreground">Students checked</dt>
                <dd className="font-medium tabular-nums">{summary.eligible}</dd>
                <dt className="text-muted-foreground">New awards to add</dt>
                <dd className="font-medium tabular-nums">{summary.toCreate}</dd>
                <dt className="text-muted-foreground">Existing awards to overwrite</dt>
                <dd className="font-medium tabular-nums">{summary.toChange}</dd>
                {summary.toRemove > 0 && (
                  <>
                    <dt className="text-muted-foreground">Duplicate awards to remove</dt>
                    <dd className="font-medium tabular-nums">{summary.toRemove}</dd>
                  </>
                )}
                <dt className="text-muted-foreground">Already correct</dt>
                <dd className="font-medium tabular-nums">{summary.unchanged}</dd>
              </dl>

              <div className="rounded-md border bg-muted/30 p-3">
                <p className="mb-1.5 text-[12px] font-medium uppercase tracking-wide text-muted-foreground">
                  Result after running
                </p>
                <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1">
                  {BAND_ORDER.map((band) => (
                    <React.Fragment key={band}>
                      <dt>{BAND_CATEGORY_NAMES[band]}</dt>
                      <dd className="font-medium tabular-nums">{summary.byBand[band]}</dd>
                    </React.Fragment>
                  ))}
                </dl>
              </div>

              {summary.skipped.count > 0 && (
                <div className="rounded-md border border-warning/40 bg-warning/10 p-3">
                  <p className="font-medium">
                    {summary.skipped.count} student{summary.skipped.count === 1 ? " has" : "s have"} a grade but no
                    percentage — not touched
                  </p>
                  <p className="mt-0.5 text-[12px] text-muted-foreground">
                    {summary.skipped.students
                      .map((s) => `${s.name} (${s.standard}, ${s.grade})`)
                      .join(" · ")}
                    {summary.skipped.count > summary.skipped.students.length &&
                      ` · and ${summary.skipped.count - summary.skipped.students.length} more`}
                  </p>
                </div>
              )}

              {nothingToDo && <p className="text-muted-foreground">Everything is already up to date.</p>}
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={running}>
              Cancel
            </Button>
            <Button onClick={() => void run()} disabled={running || nothingToDo}>
              {running && <Loader2 className="animate-spin" />}
              {running ? "Assigning…" : "Assign Awards"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
