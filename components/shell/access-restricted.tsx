import { Lock } from "lucide-react";
import { EmptyState } from "@/components/shell/page-header";

/** Shown instead of a page's real content when the signed-in user's role
 *  doesn't have the permission that page needs — reached by direct URL, not
 *  just a hidden button (see canAccess() in lib/supabase/server.ts). RLS
 *  would reject any actual write regardless; this just avoids letting
 *  someone fill out a whole form before finding that out. */
export function AccessRestricted({
  description = "Your role doesn't have permission to view this page. Ask an administrator if you need access.",
}: {
  description?: string;
}) {
  return <EmptyState icon={Lock} title="Access restricted" description={description} />;
}
