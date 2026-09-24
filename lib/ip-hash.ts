import { createHash } from "node:crypto";
import { headers } from "next/headers";

/** A rough per-device fingerprint for rate limiting, not an identity — the raw
 *  IP is never stored, only a salted hash of it. */
export function ipHash() {
  try {
    const h = headers();
    const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "unknown";
    return createHash("sha256").update(`am-apply-salt:${ip}`).digest("hex").slice(0, 32);
  } catch {
    return null;
  }
}
