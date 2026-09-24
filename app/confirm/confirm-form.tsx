"use client";

import * as React from "react";
import {
  AlertCircle,
  ArrowLeft,
  Check,
  CheckCircle2,
  ChevronRight,
  Loader2,
  MessageSquareText,
  RotateCcw,
  Search,
  Trophy,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field } from "@/components/form/field";
import { lookupConfirmRecord, submitDataConfirmation } from "@/lib/actions/data-confirmation";
import { CONFIRM_LABELS as L, CONFIRM_MESSAGES as M, CONFIRM_MESSAGES_BLOCK as C } from "@/lib/confirm-form-i18n";
import type { ConfirmLookupResult, PublicBranding, ResolvedConfirmForm } from "@/lib/types";

/** Same nested-hero-banner header apply-form.tsx uses (Trophy watermark,
 *  logo-or-fallback, app name) so both public pages read as one family —
 *  the subtitle is this form's own title (staff-editable from Forms), same
 *  as apply-form.tsx shows form.title there. */
function Header({ branding, form }: { branding: PublicBranding; form: ResolvedConfirmForm }) {
  return (
    <div className="relative overflow-hidden bg-gradient-to-br from-primary to-primary/80 px-5 py-7 text-primary-foreground sm:px-6 sm:py-8">
      <Trophy className="pointer-events-none absolute -right-4 -top-4 h-28 w-28 rotate-12 text-primary-foreground/10" />
      <div className="relative flex items-center gap-3">
        {branding.logo_url ? (
          // eslint-disable-next-line @next/next/no-img-element -- external Supabase Storage URL
          <img src={branding.logo_url} alt="" className="h-11 w-11 shrink-0 rounded-lg bg-white/90 object-contain p-1" />
        ) : (
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-white/15">
            <Trophy className="h-5 w-5" />
          </span>
        )}
        <h2 className="truncate text-2xl font-bold leading-tight tracking-tight text-primary-foreground sm:text-3xl">
          {branding.app_name}
        </h2>
      </div>
      <div className="relative mt-2.5">
        <p className="text-base font-medium leading-snug text-primary-foreground">{form.title}</p>
        {form.titleGu && (
          <p className="mt-0.5 text-[13px] font-normal leading-snug text-primary-foreground/75">{form.titleGu}</p>
        )}
      </div>
    </div>
  );
}

function Item({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="min-w-0 rounded-lg bg-muted/40 px-3.5 py-2.5">
      <dt className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 truncate text-[14px] font-medium">{value || "—"}</dd>
    </div>
  );
}

function fullName(r: ConfirmLookupResult) {
  return [r.salutation, r.first_name, r.middle_name, r.last_name].filter(Boolean).join(" ");
}

export function ConfirmForm({ form, branding }: { form: ResolvedConfirmForm; branding: PublicBranding }) {
  const [contactNo, setContactNo] = React.useState("");
  const [looking, setLooking] = React.useState(false);
  const [lookupError, setLookupError] = React.useState<string | null>(null);
  const [notFound, setNotFound] = React.useState(false);
  // Every student registered under the typed number — usually one, but
  // siblings often share a parent's number.
  const [results, setResults] = React.useState<ConfirmLookupResult[] | null>(null);
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [doneIds, setDoneIds] = React.useState<Set<string>>(new Set());

  const [note, setNote] = React.useState("");
  const [sending, setSending] = React.useState<"confirm" | "correction" | null>(null);
  const [sentKind, setSentKind] = React.useState<"confirm" | "correction" | null>(null);

  const multiple = (results?.length ?? 0) > 1;
  const selected = results
    ? results.length === 1
      ? results[0]
      : (results.find((r) => r.academic_record_id === selectedId) ?? null)
    : null;

  async function onLookup(e: React.FormEvent) {
    e.preventDefault();
    setLookupError(null);
    setNotFound(false);

    if (!/^\d{10}$/.test(contactNo.trim())) {
      setLookupError(M.contactNoInvalid);
      return;
    }

    setLooking(true);
    const res = await lookupConfirmRecord({ contact_no: contactNo }, form.slug);
    setLooking(false);

    if (!res.ok) {
      setLookupError(res.error);
      return;
    }
    if (res.data.length === 0) {
      setNotFound(true);
      return;
    }
    setResults(res.data);
  }

  async function send(hasChanges: boolean) {
    if (!selected) return;
    setSending(hasChanges ? "correction" : "confirm");
    const res = await submitDataConfirmation(
      { academic_record_id: selected.academic_record_id, contact_no: contactNo, note },
      hasChanges,
      form.slug,
    );
    setSending(null);

    if (!res.ok) {
      toast.error(res.error);
      return;
    }

    if (multiple) {
      // Back to the list with this one ticked off, so the next sibling is one
      // tap away instead of a fresh lookup.
      setDoneIds((prev) => new Set(prev).add(selected.academic_record_id));
      setSelectedId(null);
      setNote("");
      toast.success(hasChanges ? C.correctionEn : C.confirmedEn);
    } else {
      setSentKind(hasChanges ? "correction" : "confirm");
    }
  }

  function checkAnother() {
    setContactNo("");
    setResults(null);
    setSelectedId(null);
    setDoneIds(new Set());
    setNotFound(false);
    setLookupError(null);
    setNote("");
    setSentKind(null);
  }

  if (sentKind) {
    const [en, gu] = sentKind === "confirm" ? [C.confirmedEn, C.confirmedGu] : [C.correctionEn, C.correctionGu];
    return (
      <Card className="overflow-hidden">
        <div className="h-1.5 bg-gradient-to-r from-primary via-primary/70 to-primary" />
        <CardContent className="flex flex-col items-center gap-3 py-14 text-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-success/12 text-success">
            <CheckCircle2 className="h-6 w-6" />
          </span>
          <p className="max-w-sm text-[15px] text-muted-foreground">{en}</p>
          <p className="max-w-sm text-[13px] text-muted-foreground/75">{gu}</p>
          <Button variant="outline" className="mt-4" onClick={checkAnother}>
            <RotateCcw /> {M.checkAnother}
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden">
      <Header branding={branding} form={form} />
      <CardContent className="space-y-5 p-5 sm:p-6">
        {!results ? (
          // pb-[45vh] below the fields (mobile only) — this form is just one
          // short field, so the page is barely taller than the viewport;
          // with nothing to scroll, the browser can't bring a focused field
          // above the on-screen keyboard (worse once the phone number
          // field's own autofill suggestion strip eats into that space
          // too), leaving it hidden behind both. The extra padding gives it
          // room to actually scroll there. Not needed once a screen's tall
          // enough to have a real keyboard docked below it instead.
          <form onSubmit={onLookup} className="space-y-4 pb-[45vh] sm:pb-0">
            <p className="text-[13px] leading-relaxed text-muted-foreground">{L.pageIntro}</p>

            <Field label={L.contactNo} htmlFor="contact_no" required>
              <Input
                id="contact_no"
                type="tel"
                inputMode="numeric"
                autoComplete="tel"
                maxLength={10}
                placeholder="9876543210"
                value={contactNo}
                onChange={(e) => setContactNo(e.target.value.replace(/\D/g, ""))}
              />
            </Field>

            {(notFound || lookupError) && (
              <p className="flex items-start gap-2 rounded-md bg-destructive/10 px-3 py-2.5 text-[13px] font-medium leading-relaxed text-destructive">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                {notFound ? M.notFound : lookupError}
              </p>
            )}

            <Button type="submit" className="h-12 w-full text-base" disabled={looking}>
              {looking ? <Loader2 className="animate-spin" /> : <Search />}
              {looking ? M.lookingUp : L.lookupSubmit}
            </Button>
          </form>
        ) : !selected ? (
          <div className="space-y-4">
            <div className="space-y-1">
              <p className="text-[15px] font-semibold">{M.studentsFound(results.length)}</p>
              <p className="text-[13px] text-muted-foreground">{L.chooseStudent}</p>
            </div>

            <ul className="space-y-2.5">
              {results.map((r) => {
                const isDone = doneIds.has(r.academic_record_id);
                return (
                  <li key={r.academic_record_id}>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedId(r.academic_record_id);
                        setNote("");
                      }}
                      className="flex w-full items-center gap-3 rounded-lg border bg-card px-4 py-3.5 text-left transition-colors hover:border-primary/50 hover:bg-primary/[0.04]"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[15px] font-semibold">{fullName(r)}</span>
                        <span className="block truncate text-[13px] text-muted-foreground">
                          {[r.institution_name, placementFor(r)].filter((v) => v && v !== "—").join(" · ") || "—"}
                        </span>
                      </span>
                      {isDone ? (
                        <span className="flex shrink-0 items-center gap-1 text-[12px] font-medium text-success">
                          <CheckCircle2 className="h-4 w-4" /> {L.done}
                        </span>
                      ) : (
                        <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>

            <button
              type="button"
              onClick={checkAnother}
              className="w-full text-center text-[13px] font-medium text-muted-foreground hover:text-foreground hover:underline"
            >
              {M.checkAnother}
            </button>
          </div>
        ) : (
          <div className="space-y-5">
            {multiple && (
              <button
                type="button"
                onClick={() => {
                  setSelectedId(null);
                  setNote("");
                }}
                className="flex items-center gap-1.5 text-[13px] font-medium text-muted-foreground hover:text-foreground"
              >
                <ArrowLeft className="h-4 w-4" /> {L.backToList}
              </button>
            )}

            <dl className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
              <Item label={L.name} value={fullName(selected)} />
              <Item label={L.institution} value={selected.institution_name} />
              <Item label={L.standardOrCourse} value={placementFor(selected)} />
              <Item label={L.percentage} value={selected.percentage !== null ? `${selected.percentage}%` : null} />
              <Item label={L.grade} value={selected.grade} />
              <Item label={L.contactOnFile} value={selected.contact_no} />
              <Item label={L.email} value={selected.email} />
            </dl>

            <Field label={L.correctionLabel} htmlFor="note" hint={L.correctionHint}>
              <Textarea
                id="note"
                rows={3}
                placeholder={L.correctionPlaceholder.split(" / ")[0]}
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
            </Field>

            <div className="flex flex-col gap-2 sm:flex-row">
              <Button
                type="button"
                variant="outline"
                className="h-12 flex-1 text-base"
                disabled={sending !== null}
                onClick={() => void send(false)}
              >
                {sending === "confirm" ? <Loader2 className="animate-spin" /> : <Check />}
                {L.confirmCorrect}
              </Button>
              <Button
                type="button"
                className="h-12 flex-1 text-base"
                disabled={sending !== null || !note.trim()}
                onClick={() => void send(true)}
              >
                {sending === "correction" ? <Loader2 className="animate-spin" /> : <MessageSquareText />}
                {L.sendCorrection}
              </Button>
            </div>

            {!multiple && (
              <button
                type="button"
                onClick={checkAnother}
                className="w-full text-center text-[13px] font-medium text-muted-foreground hover:text-foreground hover:underline"
              >
                {M.checkAnother}
              </button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function placementFor(r: ConfirmLookupResult) {
  if (r.standard_label) return r.stream_name ? `${r.standard_label} (${r.stream_name})` : r.standard_label;
  if (r.course_name) {
    const unit = r.course_structure_type === "semester" ? "Sem" : "Year";
    return r.period_no ? `${r.course_name} · ${unit} ${r.period_no}` : r.course_name;
  }
  return "—";
}
