import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getPendingSubmissionCount } from "@/lib/data/submissions";
import { getPublicBranding } from "@/lib/actions/organization";
import { Sidebar } from "@/components/shell/sidebar";
import { Topbar } from "@/components/shell/topbar";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const [pendingSubmissions, branding] = await Promise.all([
    getPendingSubmissionCount(),
    getPublicBranding(),
  ]);

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar
        className="hidden md:flex"
        pendingSubmissions={pendingSubmissions}
        appName={branding.app_name}
        logoUrl={branding.logo_url}
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
  );
}
