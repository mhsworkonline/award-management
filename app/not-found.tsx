import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-3 px-4 text-center">
      <p className="tabular text-5xl font-semibold tracking-tight text-muted-foreground">404</p>
      <p className="text-base font-semibold">Page not found</p>
      <p className="max-w-sm text-[13px] text-muted-foreground">
        The page you were looking for doesn&apos;t exist or has moved.
      </p>
      <Button asChild className="mt-2">
        <Link href="/dashboard">Back to dashboard</Link>
      </Button>
    </main>
  );
}
