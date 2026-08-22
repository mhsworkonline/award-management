import { redirect } from "next/navigation";
import { getMyPermissionMap, requireUser } from "@/lib/supabase/server";
import { getPendingSubmissionCount } from "@/lib/data/submissions";
import { getPublicBranding } from "@/lib/actions/organization";
import { Sidebar } from "@/components/shell/sidebar";
import { Topbar } from "@/components/shell/topbar";
import { PermissionsProvider } from "@/components/providers/permissions-provider";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  // Routed through the cached requireUser() (rather than its own raw
  // supabase.auth.getUser() call) so this and getMyPermissionMap() below
  // share one real auth round trip instead of two. Middleware already
  // redirects unauthenticated requests before this ever runs — this stays as
  // a defensive fallback, now free.
  const auth = await requireUser().catch(() => null);
  if (!auth) redirect("/login");
  const { user } = auth;

  const [pendingSubmissions, branding, { isAdmin, modules }] = await Promise.all([
    getPendingSubmissionCount(),
    getPublicBranding(),
    getMyPermissionMap(),
  ]);

  return (
    <PermissionsProvider isAdmin={isAdmin} modules={modules}>
      <div className="flex h-screen overflow-hidden">
        <Sidebar
          className="hidden md:flex"
          pendingSubmissions={pendingSubmissions}
          appName={branding.app_name}
          logoUrl={branding.logo_url}
          isAdmin={isAdmin}
          modules={modules}
        />
        <div className="flex min-w-0 flex-1 flex-col">
          <Topbar email={user.email ?? "Signed in"} />
          <main className="scrollbar-thin flex-1 overflow-y-auto">
            <div className="mx-auto w-full max-w-[1400px] space-y-6 px-5 py-6 lg:px-8">
              {children}
            </div>
          </main>
        </div>
      </div>
    </PermissionsProvider>
  );
}
