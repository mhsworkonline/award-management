import { Trophy } from "lucide-react";
import { getPublicBranding } from "@/lib/actions/organization";

// Title suffix (" · <app name>") comes from the root layout's template — no
// need to duplicate the branding fetch here.
export const metadata = { title: "Apply for Award" };

/** Standalone shell for the public application — no sidebar/topbar, no auth.
 *  Sits outside the (app) route group so it never inherits the authenticated
 *  layout or its redirect-to-login check. Name and logo come from org
 *  branding (Settings → Branding), editable without touching code. */
export default async function ApplyLayout({ children }: { children: React.ReactNode }) {
  const branding = await getPublicBranding();

  return (
    <div className="min-h-screen bg-muted/30">
      <header className="flex h-14 items-center gap-2.5 border-b bg-background px-4 sm:px-6">
        {branding.logo_url ? (
          // eslint-disable-next-line @next/next/no-img-element -- external Supabase Storage URL, not a build-time asset
          <img
            src={branding.logo_url}
            alt=""
            className="h-7 w-7 shrink-0 rounded-md object-contain"
          />
        ) : (
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <Trophy className="h-4 w-4" />
          </span>
        )}
        <span className="truncate text-[15px] font-semibold tracking-tight">
          {branding.app_name}
        </span>
      </header>
      <main className="mx-auto w-full max-w-xl px-4 py-6 sm:px-6 sm:py-10">{children}</main>
    </div>
  );
}
