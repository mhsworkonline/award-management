import { createClient } from "@/lib/supabase/server";
import { ORG_ID } from "@/lib/constants";
import { T } from "@/lib/tables";
import type { ShortLink } from "@/lib/types";

export async function listShortLinks(): Promise<ShortLink[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from(T.shortLinks)
    .select("*")
    .eq("org_id", ORG_ID)
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) throw new Error(error.message);
  return (data ?? []) as ShortLink[];
}
