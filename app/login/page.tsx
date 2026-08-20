import { Suspense } from "react";
import { Trophy } from "lucide-react";
import { getPublicBranding } from "@/lib/actions/organization";
import { LoginForm } from "./login-form";

export const metadata = { title: "Sign in" };

export default async function LoginPage() {
  const branding = await getPublicBranding();

  return (
    <main className="flex min-h-screen items-center justify-center bg-muted/30 px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-7 flex flex-col items-center gap-2.5 text-center">
          {branding.logo_url ? (
            // eslint-disable-next-line @next/next/no-img-element -- external Supabase Storage URL
            <img
              src={branding.logo_url}
              alt=""
              className="h-10 w-10 rounded-lg object-contain shadow-soft"
            />
          ) : (
            <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-soft">
              <Trophy className="h-5 w-5" />
            </span>
          )}
          <h1 className="text-xl font-semibold tracking-tight">{branding.app_name}</h1>
          <p className="text-[13px] text-muted-foreground">
            Sign in to manage students, awards and prize distribution.
          </p>
        </div>

        <div className="rounded-lg border bg-card p-6 shadow-soft">
          <Suspense fallback={null}>
            <LoginForm />
          </Suspense>
        </div>

        <p className="mt-5 text-center text-[12px] text-muted-foreground">
          Accounts are created by an administrator in Supabase.
        </p>
      </div>
    </main>
  );
}
