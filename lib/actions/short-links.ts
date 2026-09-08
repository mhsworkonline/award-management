"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/supabase/server";
import { ORG_ID } from "@/lib/constants";
import { writeAudit } from "@/lib/audit";
import { friendly, message } from "@/lib/actions/crud";
import { T } from "@/lib/tables";
import type { ActionResult } from "@/lib/types";

const CODE_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
const CODE_LENGTH = 7;

function randomCode() {
  const bytes = randomBytes(CODE_LENGTH);
  let code = "";
  for (let i = 0; i < CODE_LENGTH; i++) code += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
  return code;
}

/** Self-hosted replacement for the old TinyURL integration — see
 *  0030_am_short_links.sql. Generic: takes any URL, has no idea what it's
 *  for. Retries on a code collision (62^7 possibilities, so this basically
 *  never actually loops) rather than trusting a single random draw to
 *  always be unique. */
export async function createShortLink(url: string): Promise<ActionResult<{ code: string }>> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { ok: false, error: "Enter a valid URL" };
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return { ok: false, error: "URL must start with http:// or https://" };
  }

  try {
    const { supabase, actor } = await requireUser();

    for (let attempt = 0; attempt < 5; attempt++) {
      const code = randomCode();
      const { error } = await supabase.from(T.shortLinks).insert({
        org_id: ORG_ID,
        code,
        target_url: parsed.toString(),
        created_by: actor,
      });

      if (!error) {
        await writeAudit(supabase, {
          entity: "short_links",
          entityId: code,
          action: "create",
          actor,
          diff: { target_url: parsed.toString() },
        });
        revalidatePath("/settings");
        return { ok: true, data: { code } };
      }
      if (!error.message.includes("duplicate key")) {
        return { ok: false, error: friendly(error.message) };
      }
      // Collision on the code itself — try another one.
    }

    return { ok: false, error: "Could not generate a unique code — try again" };
  } catch (e) {
    return { ok: false, error: message(e) };
  }
}

export async function deleteShortLink(id: string): Promise<ActionResult<null>> {
  try {
    const { supabase, actor } = await requireUser();

    const { data: before } = await supabase.from(T.shortLinks).select("*").eq("id", id).single();
    const { error } = await supabase.from(T.shortLinks).delete().eq("id", id).eq("org_id", ORG_ID);
    if (error) return { ok: false, error: friendly(error.message) };

    await writeAudit(supabase, {
      entity: "short_links",
      entityId: before?.code ?? id,
      action: "delete",
      actor,
      diff: { target_url: before?.target_url ?? null },
    });
    revalidatePath("/settings");
    return { ok: true, data: null };
  } catch (e) {
    return { ok: false, error: message(e) };
  }
}
