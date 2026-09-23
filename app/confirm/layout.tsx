// Title suffix (" · <app name>") comes from the root layout's template — no
// need to fetch branding here.
export const metadata = { title: "Confirm Your Details" };

/** Standalone shell for the public confirm-your-details page — no
 *  sidebar/topbar, no auth. Sits outside the (app) route group (same as
 *  /apply) so it never inherits the authenticated layout or its
 *  redirect-to-login check. Branding renders inside the page's own card
 *  (see confirm-form.tsx), not up here — same split /apply uses. */
export default function ConfirmLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gradient-to-b from-primary/20 via-muted/40 to-muted/30">
      <main className="mx-auto w-full max-w-xl px-4 py-6 sm:px-6 sm:py-10">{children}</main>
    </div>
  );
}
