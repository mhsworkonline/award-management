"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { Gift, Loader2, MoreHorizontal, Package, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableWrap,
} from "@/components/ui/table";
import { EmptyState, PageHeader } from "@/components/shell/page-header";
import { Field, FieldGrid } from "@/components/form/field";
import { ConfirmDialog } from "@/components/form/confirm-dialog";
import { deleteConfig, saveConfig } from "@/lib/actions/settings";
import { formatCurrency } from "@/lib/utils";
import type { GiftItem } from "@/lib/types";

type GiftWithUsage = GiftItem & { allocated: number; distributed: number };

type Values = { name: string; sku: string; unit_cost: string; quantity_on_hand: string };

export function GiftsClient({ gifts }: { gifts: GiftWithUsage[] }) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<GiftWithUsage | null>(null);
  const [pendingDelete, setPendingDelete] = React.useState<GiftWithUsage | null>(null);
  const [serverError, setServerError] = React.useState<string | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<Values>({
    defaultValues: { name: "", sku: "", unit_cost: "0", quantity_on_hand: "0" },
  });

  React.useEffect(() => {
    if (!open) return;
    setServerError(null);
    reset(
      editing
        ? {
            name: editing.name,
            sku: editing.sku ?? "",
            unit_cost: String(editing.unit_cost ?? 0),
            quantity_on_hand: String(editing.quantity_on_hand ?? 0),
          }
        : { name: "", sku: "", unit_cost: "0", quantity_on_hand: "0" },
    );
  }, [open, editing, reset]);

  async function onSubmit(values: Values) {
    setServerError(null);
    const result = await saveConfig("gift_items", {
      id: editing?.id,
      name: values.name,
      sku: values.sku || undefined,
      unit_cost: values.unit_cost,
      quantity_on_hand: values.quantity_on_hand,
    });

    if (!result.ok) {
      setServerError(
        result.fieldErrors ? Object.values(result.fieldErrors).flat().join(" · ") : result.error,
      );
      return;
    }

    toast.success(editing ? "Gift item updated" : "Gift item added");
    router.refresh();
    setOpen(false);
    setEditing(null);
  }

  const totals = gifts.reduce(
    (acc, g) => ({
      stock: acc.stock + g.quantity_on_hand,
      value: acc.value + g.quantity_on_hand * Number(g.unit_cost ?? 0),
      allocated: acc.allocated + g.allocated,
      distributed: acc.distributed + g.distributed,
    }),
    { stock: 0, value: 0, allocated: 0, distributed: 0 },
  );

  return (
    <>
      <PageHeader
        title="Gift inventory"
        description="Stock is reduced automatically when a gift is allocated to an award, and restored if the allocation is removed."
        actions={
          <Button
            onClick={() => {
              setEditing(null);
              setOpen(true);
            }}
          >
            <Plus /> Add gift item
          </Button>
        }
      />

      <div className="grid gap-4 sm:grid-cols-4">
        <Tile label="Units in stock" value={totals.stock.toLocaleString("en-IN")} />
        <Tile label="Stock value" value={formatCurrency(totals.value)} />
        <Tile label="Allocated" value={totals.allocated.toLocaleString("en-IN")} />
        <Tile label="Distributed" value={totals.distributed.toLocaleString("en-IN")} />
      </div>

      <TableWrap className="max-h-[calc(100vh-380px)]">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[30%]">Item</TableHead>
              <TableHead className="w-[14%]">SKU</TableHead>
              <TableHead className="w-[13%] text-right">Unit cost</TableHead>
              <TableHead className="w-[12%] text-right">In stock</TableHead>
              <TableHead className="w-[12%] text-right">Allocated</TableHead>
              <TableHead className="w-[15%] text-right">Distributed</TableHead>
              <TableHead className="w-[4%] text-right">
                <span className="sr-only">Actions</span>
              </TableHead>
            </TableRow>
          </TableHeader>

          <TableBody>
            {gifts.length === 0 ? (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={7} className="border-b-0">
                  <EmptyState
                    icon={Gift}
                    title="No gift items yet"
                    description="Add the prizes you distribute — trophies, book sets, medals — with their stock quantity."
                    action={
                      <Button
                        onClick={() => {
                          setEditing(null);
                          setOpen(true);
                        }}
                      >
                        <Plus /> Add gift item
                      </Button>
                    }
                  />
                </TableCell>
              </TableRow>
            ) : (
              gifts.map((g) => (
                <TableRow key={g.id}>
                  <TableCell className="font-medium">{g.name}</TableCell>
                  <TableCell className="tabular text-muted-foreground">{g.sku || "—"}</TableCell>
                  <TableCell className="tabular text-right">
                    {formatCurrency(g.unit_cost)}
                  </TableCell>
                  <TableCell className="text-right">
                    <Badge
                      variant={
                        g.quantity_on_hand === 0
                          ? "destructive"
                          : g.quantity_on_hand < 10
                            ? "warning"
                            : "secondary"
                      }
                    >
                      {g.quantity_on_hand}
                    </Badge>
                  </TableCell>
                  <TableCell className="tabular text-right text-muted-foreground">
                    {g.allocated}
                  </TableCell>
                  <TableCell className="tabular text-right text-muted-foreground">
                    {g.distributed}
                  </TableCell>
                  <TableCell className="text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon-sm" aria-label="Row actions">
                          <MoreHorizontal />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          onClick={() => {
                            setEditing(g);
                            setOpen(true);
                          }}
                        >
                          <Pencil /> Edit
                        </DropdownMenuItem>
                        <DropdownMenuItem destructive onClick={() => setPendingDelete(g)}>
                          <Trash2 /> Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </TableWrap>

      <Sheet
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) setEditing(null);
        }}
      >
        <SheetContent className="sm:max-w-md">
          <form onSubmit={handleSubmit(onSubmit)} className="flex h-full flex-col">
            <SheetHeader>
              <SheetTitle>{editing ? "Edit gift item" : "Add gift item"}</SheetTitle>
              <SheetDescription>
                {editing
                  ? "Adjust stock here when new inventory arrives."
                  : "Record the prize and how many units you hold."}
              </SheetDescription>
            </SheetHeader>

            <SheetBody className="space-y-5">
              <Field label="Item name" htmlFor="gift-name" required error={errors.name?.message}>
                <Input
                  id="gift-name"
                  autoFocus
                  autoComplete="off"
                  placeholder="e.g. Trophy — Large"
                  {...register("name", { required: "Name is required" })}
                />
              </Field>

              <Field label="SKU / code" htmlFor="gift-sku">
                <Input id="gift-sku" autoComplete="off" {...register("sku")} />
              </Field>

              <FieldGrid>
                <Field label="Unit cost (₹)" htmlFor="gift-cost">
                  <Input
                    id="gift-cost"
                    type="number"
                    min={0}
                    step="0.01"
                    className="tabular"
                    {...register("unit_cost")}
                  />
                </Field>
                <Field
                  label="Quantity on hand"
                  htmlFor="gift-qty"
                  hint={editing ? `${editing.allocated} already allocated` : undefined}
                >
                  <Input
                    id="gift-qty"
                    type="number"
                    min={0}
                    className="tabular"
                    {...register("quantity_on_hand")}
                  />
                </Field>
              </FieldGrid>

              {serverError && (
                <p className="rounded-md bg-destructive/10 px-3 py-2 text-[13px] font-medium text-destructive">
                  {serverError}
                </p>
              )}
            </SheetBody>

            <SheetFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting && <Loader2 className="animate-spin" />}
                {editing ? "Save changes" : "Add item"}
              </Button>
            </SheetFooter>
          </form>
        </SheetContent>
      </Sheet>

      <ConfirmDialog
        open={Boolean(pendingDelete)}
        onOpenChange={(next) => !next && setPendingDelete(null)}
        title={`Delete ${pendingDelete?.name ?? "gift item"}?`}
        description={
          (pendingDelete?.allocated ?? 0) > 0
            ? "This item is allocated to one or more awards and cannot be deleted until those allocations are removed."
            : "This cannot be undone."
        }
        onConfirm={async () => {
          const result = await deleteConfig("gift_items", pendingDelete!.id);
          if (result.ok) router.refresh();
          return result;
        }}
      />
    </>
  );
}

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-center justify-between">
          <p className="text-[13px] font-medium text-muted-foreground">{label}</p>
          <Package className="h-4 w-4 text-muted-foreground" />
        </div>
        <p className="tabular mt-2 text-xl font-semibold leading-none tracking-tight">{value}</p>
      </CardContent>
    </Card>
  );
}
