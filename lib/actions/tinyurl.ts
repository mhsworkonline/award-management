"use server";

import { requireUser } from "@/lib/supabase/server";
import { message } from "@/lib/actions/crud";
import type { ActionResult } from "@/lib/types";

/** Calls TinyURL's public, keyless shortening endpoint server-side — avoids
 *  a browser CORS round trip (tinyurl.com doesn't set CORS headers for this
 *  endpoint) and keeps the outbound call off the client. Nothing is stored
 *  on our side; TinyURL owns the mapping and the resulting link lives on
 *  their domain, not ours. */
export async function shortenUrl(url: string): Promise<ActionResult<{ shortUrl: string }>> {
  try {
    await requireUser();

    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      return { ok: false, error: "Enter a valid URL" };
    }
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return { ok: false, error: "URL must start with http:// or https://" };
    }

    const res = await fetch(`https://tinyurl.com/api-create.php?url=${encodeURIComponent(parsed.toString())}`, {
      method: "GET",
      cache: "no-store",
    });
    const text = (await res.text()).trim();

    // On success the endpoint returns the short link as plain text; on
    // failure it returns an error string (or a non-2xx status) instead.
    if (!res.ok || !/^https?:\/\/tinyurl\.com\//i.test(text)) {
      return { ok: false, error: text || "Could not shorten this link — try again" };
    }

    return { ok: true, data: { shortUrl: text } };
  } catch (e) {
    return { ok: false, error: message(e) };
  }
}
