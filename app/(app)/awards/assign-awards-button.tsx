"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, Loader2, Wand2 } from "lucide-react";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  applyAwardAssignment,
  previewAwardAssignment,
  type AssignmentSummary,
} from "@/lib/actions/award-assignment";
import { BAND_CATEGORY_NAMES, BAND_ORDER } from "@/lib/awards/percentage-rule";
import { ruleByKey, rulesForInstitutionType, type AwardRuleKey } from "@/lib/awards/rules";

type InstitutionType = "school" | "college";

/** "Assign Awards": runs a rule against every matching record for the year
 *  being viewed. Institution type is picked first, then which rule to apply
 *  to it — today there's exactly one rule per type, but the picker is built
 *  to offer more later without changing this flow. It previews before
 *  changing anything, since confirming overwrites existing rank/consolation
 *  awards. */
export function AssignAwardsButton({ yearId, yearLabel }: { yearId: string | null; yearLabel: string }) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [step, setStep] = React.useState<"choose" | "preview">("choose");
  const [institutionType, setInstitutionType] = React.useState<InstitutionType>("school");
  const [ruleKey, setRuleKey] = React.useState<AwardRuleKey>("school_percentage");
  const [loading, setLoading] = React.useState(false);
  const [running, setRunning] = React.useState(false);
  const [summary, setSummary] = React.useState<AssignmentSummary | null>(null);

  function openDialog() {
    setStep("choose");
    setSummary(null);
    setOpen(true);
  }

  function changeInstitutionType(type: InstitutionType) {
    setInstitutionType(type);
    // Each type has its own rule list — jump to that type's first (today, only) rule.
    setRuleKey(rulesForInstitutionType(type)[0].key);
  }

  async function openPreview() {
    if (!yearId) return;
    setLoading(true);
    const result = await previewAwardAssignment(yearId, ruleKey);
    setLoading(false);
    if (!result.ok) {
      toast.error("Could not check the awards", { description: result.error });
      return;
    }
    setSummary(result.data);
    setStep("preview");
  }

  async function run() {
    if (!yearId) return;
    setRunning(true);
    const result = await applyAwardAssignment(yearId, ruleKey);
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

  const rule = ruleByKey(ruleKey);
  const nothingToDo = summary !== null && summary.toCreate + summary.toChange + summary.toRemove === 0;

  return (
    <>
      <Button variant="outline" onClick={openDialog} disabled={!yearId}>
        <Wand2 /> Assign Awards
      </Button>

      <Dialog open={open} onOpenChange={(o) => !running && !loading && setOpen(o)}>
        <DialogContent className="max-w-md">
          {step === "choose" ? (
            <>
              <DialogHeader>
                <DialogTitle>Assign awards for {yearLabel}</DialogTitle>
                <DialogDescription>Choose who this run applies to, and which rule to use.</DialogDescription>
              </DialogHeader>

              <div className="space-y-4">
                <div className="space-y-1.5">
                  <span className="text-[13px] font-medium">Institution type</span>
                  <div className="grid grid-cols-2 gap-2">
                    {(["school", "college"] as const).map((type) => (
                      <button
                        key={type}
                        type="button"
                        onClick={() => changeInstitutionType(type)}
                        className={`rounded-md border px-3 py-2 text-[13px] font-medium capitalize transition-colors ${
                          institutionType === type
                            ? "border-primary bg-primary/10 text-primary"
                            : "border-input hover:bg-accent"
                        }`}
                      >
                        {type}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-1.5">
                  <span className="text-[13px] font-medium">Rule</span>
                  <Select value={ruleKey} onValueChange={(v) => setRuleKey(v as AwardRuleKey)}>
                    <SelectTrigger aria-label="Rule">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {rulesForInstitutionType(institutionType).map((r) => (
                        <SelectItem key={r.key} value={r.key}>
                          {r.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-[12px] text-muted-foreground">{rule.description}</p>
                </div>
              </div>

              <DialogFooter>
                <Button variant="outline" onClick={() => setOpen(false)}>
                  Cancel
                </Button>
                <Button onClick={() => void openPreview()} disabled={loading}>
                  {loading && <Loader2 className="animate-spin" />}
                  Check
                </Button>
              </DialogFooter>
            </>
          ) : (
            <>
              <DialogHeader>
                <DialogTitle>
                  {rule.label} — {institutionType === "school" ? "Schools" : "Colleges"}, {yearLabel}
                </DialogTitle>
                <DialogDescription>{rule.description}</DialogDescription>
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
                        {summary.skipped.count} student{summary.skipped.count === 1 ? " has" : "s have"} a grade but
                        no percentage — not touched
                      </p>
                      <p className="mt-0.5 text-[12px] text-muted-foreground">
                        {summary.skipped.students.map((s) => `${s.name} (${s.group}, ${s.grade})`).join(" · ")}
                        {summary.skipped.count > summary.skipped.students.length &&
                          ` · and ${summary.skipped.count - summary.skipped.students.length} more`}
                      </p>
                    </div>
                  )}

                  {nothingToDo && <p className="text-muted-foreground">Everything is already up to date.</p>}
                </div>
              )}

              <DialogFooter className="justify-between sm:justify-between">
                <Button type="button" variant="ghost" onClick={() => setStep("choose")} disabled={running}>
                  <ChevronLeft /> Back
                </Button>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => setOpen(false)} disabled={running}>
                    Cancel
                  </Button>
                  <Button onClick={() => void run()} disabled={running || nothingToDo}>
                    {running && <Loader2 className="animate-spin" />}
                    {running ? "Assigning…" : "Assign Awards"}
                  </Button>
                </div>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
