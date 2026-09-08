import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { FN } from "@/lib/tables";

/** Public redirect endpoint for self-hosted short links — the whole reason
 *  they're self-hosted is to never hand this off to a third party. Resolves
 *  through am_resolve_short_link (SECURITY DEFINER — anon has no direct
 *  table access) rather than a public select policy, same pattern as every
 *  other anon-facing lookup in this app. */
export async function GET(request: Request, { params }: { params: { code: string } }) {
  const supabase = createClient();
  const { data, error } = await supabase.rpc(FN.resolveShortLink, { p_code: params.code });

  if (error || !data) {
    return new NextResponse("This link doesn't exist or has been removed.", { status: 404 });
  }

  const target = (data as { target_url: string }).target_url;
  return NextResponse.redirect(new URL(target, request.url), { status: 302 });
}
