"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Gift, Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Field, FieldGrid } from "@/components/form/field";
import { allocateGift, deallocateGift } from "@/lib/actions/awards";
import { formatCurrency } from "@/lib/utils";
import { usePermissions } from "@/components/providers/permissions-provider";
import type { AwardRow } from "@/lib/data/awards";
import type { Lookups } from "@/lib/types";

export function AllocateSheet({
  award,
  onOpenChange,
  lookups,
}: {
  award: AwardRow | null;
  onOpenChange: (open: boolean) => void;
  lookups: Lookups;
}) {
  const router = useRouter();
  const { can } = usePermissions();
  const canCreate = can("awards", "create");
  const canDelete = can("awards", "delete");
  const [giftId, setGiftId] = React.useState("");
  const [quantity, setQuantity] = React.useState("1");
  const [saving, setSaving] = React.useState(false);
  const [removingId, setRemovingId] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!award) return;
    setGiftId("");
    setQuantity("1");
    setError(null);
  }, [award]);

  const gift = lookups.giftItems.find((g) => g.id === giftId);
  const requested = Number(quantity) || 0;
  const overStock = Boolean(gift && requested > gift.quantity_on_hand);

  async function submit() {
    if (!award || !giftId) return;
    setSaving(true);
    setError(null);

    const result = await allocateGift({
      student_award_id: award.id,
      gift_item_id: giftId,
      quantity: requested,
    });
    setSaving(false);

    if (!result.ok) {
      setError(result.error);
      return;
    }

    toast.success("Gift allocated", {
      description: "A pending distribution entry was created.",
    });
    setGiftId("");
    setQuantity("1");
    router.refresh();
  }

  async function remove(id: string) {
    setRemovingId(id);
    const result = await deallocateGift(id);
    setRemovingId(null);

    if (!result.ok) {
      toast.error("Could not remove", { description: result.error });
      return;
    }
    toast.success("Allocation removed — stock returned to inventory");
    router.refresh();
  }

  return (
    <Sheet open={Boolean(award)} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-lg">
        {award && (
          <>
            <SheetHeader>
              <SheetTitle>Allocate gift</SheetTitle>
              <SheetDescription>
                {award.student_name} · {award.category_name} · {award.institution_name}
              </SheetDescription>
            </SheetHeader>

            <SheetBody className="space-y-5">
              <div>
                <p className="text-[12px] font-medium uppercase tracking-wide text-muted-foreground">
                  Current allocations
                </p>
                {award.allocations.length === 0 ? (
                  <p className="mt-1.5 text-[13px] text-muted-foreground">
                    Nothing allocated yet.
                  </p>
                ) : (
                  <ul className="mt-2 space-y-2">
                    {award.allocations.map((a) => (
                      <li
                        key={a.id}
                        className="flex items-center justify-between gap-3 rounded-md border bg-muted/30 px-3 py-2"
                      >
                        <span className="flex min-w-0 items-center gap-2 text-[13px]">
                          <Gift className="h-3.5 w-3.5 shrink-0 text-primary" />
                          <span className="truncate font-medium">{a.gift_name}</span>
                          {a.quantity > 1 && <Badge variant="outline">×{a.quantity}</Badge>}
                          <Badge
                            variant={a.distribution_status === "distributed" ? "success" : "warning"}
                          >
                            {a.distribution_status === "distributed" ? "Distributed" : "Pending"}
                          </Badge>
                        </span>
                        {canDelete && (
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            aria-label="Remove allocation"
                            disabled={removingId === a.id || a.distribution_status === "distributed"}
                            onClick={() => void remove(a.id)}
                          >
                            {removingId === a.id ? (
                              <Loader2 className="animate-spin" />
                            ) : (
                              <Trash2 className="text-destructive" />
                            )}
                          </Button>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {canCreate && (
              <FieldGrid>
                <Field label="Gift item" required>
                  <Select value={giftId} onValueChange={setGiftId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select gift" />
                    </SelectTrigger>
                    <SelectContent>
                      {lookups.giftItems.length === 0 ? (
                        <div className="px-2 py-3 text-[13px] text-muted-foreground">
                          Add gift items under Settings first
                        </div>
                      ) : (
                        lookups.giftItems.map((g) => (
                          <SelectItem key={g.id} value={g.id}>
                            {g.name} · {g.quantity_on_hand} in stock
                          </SelectItem>
                        ))
                      )}
                    </SelectContent>
                  </Select>
                </Field>

                <Field
                  label="Quantity"
                  htmlFor="quantity"
                  error={overStock ? `Only ${gift?.quantity_on_hand} in stock` : undefined}
                  hint={gift ? `${formatCurrency(gift.unit_cost)} per unit` : undefined}
                >
                  <Input
                    id="quantity"
                    type="number"
                    min={1}
                    max={gift?.quantity_on_hand ?? 999}
                    value={quantity}
                    onChange={(e) => setQuantity(e.target.value)}
                    className="tabular"
                  />
                </Field>
              </FieldGrid>
              )}

              {error && (
                <p className="rounded-md bg-destructive/10 px-3 py-2 text-[13px] font-medium text-destructive">
                  {error}
                </p>
              )}
            </SheetBody>

            <SheetFooter>
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Done
              </Button>
              {canCreate && (
                <Button
                  onClick={() => void submit()}
                  disabled={!giftId || saving || overStock || requested < 1}
                >
                  {saving ? <Loader2 className="animate-spin" /> : <Gift />}
                  Allocate
                </Button>
              )}
            </SheetFooter>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
