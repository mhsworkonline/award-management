// Title suffix (" · <app name>") comes from the root layout's template — no
// need to fetch branding here.
export const metadata = { title: "Apply for Award" };

/** Standalone shell for the public application — no sidebar/topbar, no auth.
 *  Sits outside the (app) route group so it never inherits the authenticated
 *  layout or its redirect-to-login check. Branding (name/logo) is rendered
 *  inside the form card itself (see apply-form.tsx), not up here, so it
 *  reads as part of the form rather than a separate page chrome. */
export default function ApplyLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-muted/30">
      <main className="mx-auto w-full max-w-xl px-4 py-6 sm:px-6 sm:py-10">{children}</main>
    </div>
  );
}
