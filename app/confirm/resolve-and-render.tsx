import { AlertTriangle, Trophy } from "lucide-react";
import { resolveConfirmForm } from "@/lib/actions/data-confirmation";
import { getPublicBranding } from "@/lib/actions/organization";
import { ConfirmForm } from "./confirm-form";

/** Shared by /confirm (no slug — org default) and /confirm/[slug] (explicit
 *  form) — the exact same split ResolveAndRenderApply uses for /apply. A
 *  missing or disabled form lands on the same friendly "not open" message
 *  either way; a visitor never needs to know which. */
export async function ResolveAndRenderConfirm({ slug }: { slug?: string }) {
  const [formResult, branding] = await Promise.all([resolveConfirmForm(slug), getPublicBranding()]);
  const form = formResult.ok ? formResult.data : null;

  if (!form || !form.is_enabled) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-lg border bg-card p-8 text-center shadow-soft">
        {branding.logo_url ? (
          // eslint-disable-next-line @next/next/no-img-element -- external Supabase Storage URL
          <img src={branding.logo_url} alt="" className="h-9 w-9 rounded-md object-contain" />
        ) : (
          <span className="flex h-9 w-9 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <Trophy className="h-4 w-4" />
          </span>
        )}
        <AlertTriangle className="h-6 w-6 text-warning" />
        <p className="text-[15px] font-medium">
          {form && !form.is_enabled ? "Confirmations aren't open right now" : "This page isn't available right now"}
        </p>
        <p className="text-[13px] text-muted-foreground">Please check back later or contact us.</p>
      </div>
    );
  }

  return <ConfirmForm form={form} branding={branding} />;
}
