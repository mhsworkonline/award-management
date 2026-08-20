import { AlertTriangle } from "lucide-react";
import { getPublicFormOptions, resolveApplicationForm } from "@/lib/actions/public-application";
import { ApplyForm } from "./apply-form";

/** Shared by /apply (no slug — org default) and /apply/[slug] (explicit form).
 *  A missing or disabled form and a missing academic year all land on the same
 *  friendly "not open" message — a visitor never needs to know which. */
export async function ResolveAndRenderApply({ slug }: { slug?: string }) {
  const [formResult, optionsResult] = await Promise.all([
    resolveApplicationForm(slug),
    getPublicFormOptions(),
  ]);

  const form = formResult.ok ? formResult.data : null;

  if (!form || !form.is_enabled || !optionsResult.ok) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-lg border bg-card p-8 text-center shadow-soft">
        <AlertTriangle className="h-6 w-6 text-warning" />
        <p className="text-[15px] font-medium">
          {form && !form.is_enabled ? "This form is currently closed" : "Applications aren't open right now"}
        </p>
        <p className="text-[13px] text-muted-foreground">
          Please check back later or contact your institution.
        </p>
      </div>
    );
  }

  return <ApplyForm form={form} options={optionsResult.data} />;
}
