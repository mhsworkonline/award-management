import { createClient } from "@/lib/supabase/server";
import { ORG_ID } from "@/lib/constants";
import { GiftsClient } from "./gifts-client";
import type { GiftItem } from "@/lib/types";
import { T } from "@/lib/tables";

export const metadata = { title: "Gift inventory" };

export default async function GiftsPage() {
  const supabase = createClient();

  const [gifts, allocations] = await Promise.all([
    supabase.from(T.giftItems).select("*").eq("org_id", ORG_ID).order("name"),
    supabase
      .from(T.giftAllocations)
      .select("gift_item_id, quantity, distribution_records:am_distribution_records ( status )")
      .eq("org_id", ORG_ID)
      .limit(20000),
  ]);

  const usage = new Map<string, { allocated: number; distributed: number }>();
  for (const row of (allocations.data ?? []) as unknown as {
    gift_item_id: string;
    quantity: number;
    distribution_records: { status: string }[] | null;
  }[]) {
    const entry = usage.get(row.gift_item_id) ?? { allocated: 0, distributed: 0 };
    entry.allocated += row.quantity;
    if (row.distribution_records?.[0]?.status === "distributed") entry.distributed += row.quantity;
    usage.set(row.gift_item_id, entry);
  }

  const rows = ((gifts.data ?? []) as GiftItem[]).map((g) => ({
    ...g,
    allocated: usage.get(g.id)?.allocated ?? 0,
    distributed: usage.get(g.id)?.distributed ?? 0,
  }));

  return <GiftsClient gifts={rows} />;
}
