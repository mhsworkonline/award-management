"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2, MoreHorizontal, Pencil, Plus, Settings2, Star, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableWrap,
} from "@/components/ui/table";
import { EmptyState } from "@/components/shell/page-header";
import { Field } from "@/components/form/field";
import { ConfirmDialog } from "@/components/form/confirm-dialog";
import { deleteConfig, saveConfig, setActiveYear, type ConfigTable } from "@/lib/actions/settings";

export type FieldSpec = {
  name: string;
  label: string;
  type: "text" | "number" | "date" | "select";
  required?: boolean;
  hint?: string;
  options?: { value: string; label: string }[];
  min?: number;
  max?: number;
  default?: string;
};

export type ColumnSpec = {
  key: string;
  label: string;
  align?: "left" | "right";
  render?: (row: Record<string, unknown>) => React.ReactNode;
};

/** One CRUD surface reused by every config entity. New entity = a spec, not a
 *  new screen — which is what makes boards, mediums and courses addable from
 *  Settings without touching code. */
export function ConfigSection({
  table,
  title,
  description,
  addLabel,
  rows,
  columns,
  fields,
  supportsActiveFlag,
}: {
  table: ConfigTable;
  title: string;
  description: string;
  addLabel: string;
  rows: Record<string, unknown>[];
  columns: ColumnSpec[];
  fields: FieldSpec[];
  supportsActiveFlag?: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<Record<string, unknown> | null>(null);
  const [pendingDelete, setPendingDelete] = React.useState<Record<string, unknown> | null>(null);
  const [values, setValues] = React.useState<Record<string, string>>({});
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [activating, setActivating] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!open) return;
    setError(null);
    const next: Record<string, string> = {};
    for (const field of fields) {
      const raw = editing?.[field.name];
      next[field.name] =
        raw === null || raw === undefined ? (field.default ?? "") : String(raw);
    }
    setValues(next);
  }, [open, editing, fields]);

  function openAdd() {
    setEditing(null);
    setOpen(true);
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);

    const missing = fields.find((f) => f.required && !values[f.name]?.trim());
    if (missing) {
      setError(`${missing.label} is required`);
      return;
    }

    setSaving(true);
    const payload: Record<string, unknown> = { id: editing?.id };
    for (const field of fields) {
      const raw = values[field.name]?.trim() ?? "";
      payload[field.name] = raw === "" ? undefined : raw;
    }
    if (supportsActiveFlag) payload.is_active = Boolean(editing?.is_active);

    const result = await saveConfig(table, payload);
    setSaving(false);

    if (!result.ok) {
      setError(
        result.fieldErrors ? Object.values(result.fieldErrors).flat().join(" · ") : result.error,
      );
      return;
    }

    toast.success(editing ? `${title} updated` : `${title} added`);
    router.refresh();
    setOpen(false);
    setEditing(null);
  }

  async function activate(id: string) {
    setActivating(id);
    const result = await setActiveYear(id);
    setActivating(null);

    if (!result.ok) {
      toast.error("Could not set active year", { description: result.error });
      return;
    }
    toast.success("Active academic year updated");
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-[15px] font-semibold tracking-tight">{title}</h2>
          <p className="mt-0.5 text-[13px] text-muted-foreground">{description}</p>
        </div>
        <Button onClick={openAdd} size="sm">
          <Plus /> {addLabel}
        </Button>
      </div>

      <TableWrap className="max-h-[520px]">
        <Table>
          <TableHeader>
            <TableRow>
              {columns.map((c) => (
                <TableHead key={c.key} className={c.align === "right" ? "text-right" : undefined}>
                  {c.label}
                </TableHead>
              ))}
              {supportsActiveFlag && <TableHead className="w-24">Active</TableHead>}
              <TableHead className="w-12 text-right">
                <span className="sr-only">Actions</span>
              </TableHead>
            </TableRow>
          </TableHeader>

          <TableBody>
            {rows.length === 0 ? (
              <TableRow className="hover:bg-transparent">
                <TableCell
                  colSpan={columns.length + (supportsActiveFlag ? 2 : 1)}
                  className="border-b-0"
                >
                  <EmptyState
                    icon={Settings2}
                    title={`No ${title.toLowerCase()} yet`}
                    description={description}
                    action={
                      <Button onClick={openAdd} size="sm">
                        <Plus /> {addLabel}
                      </Button>
                    }
                  />
                </TableCell>
              </TableRow>
            ) : (
              rows.map((row) => (
                <TableRow key={String(row.id)}>
                  {columns.map((c) => (
                    <TableCell
                      key={c.key}
                      className={c.align === "right" ? "tabular text-right" : undefined}
                    >
                      {c.render ? c.render(row) : ((row[c.key] as React.ReactNode) ?? "—")}
                    </TableCell>
                  ))}

                  {supportsActiveFlag && (
                    <TableCell>
                      {row.is_active ? (
                        <Badge variant="success">
                          <Star className="h-3 w-3" /> Active
                        </Badge>
                      ) : (
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={activating === row.id}
                          onClick={() => void activate(String(row.id))}
                        >
                          {activating === row.id ? (
                            <Loader2 className="animate-spin" />
                          ) : (
                            "Set active"
                          )}
                        </Button>
                      )}
                    </TableCell>
                  )}

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
                            setEditing(row);
                            setOpen(true);
                          }}
                        >
                          <Pencil /> Edit
                        </DropdownMenuItem>
                        <DropdownMenuItem destructive onClick={() => setPendingDelete(row)}>
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
          <form onSubmit={submit} className="flex h-full flex-col">
            <SheetHeader>
              <SheetTitle>
                {editing ? `Edit ${title.toLowerCase()}` : addLabel}
              </SheetTitle>
              <SheetDescription>{description}</SheetDescription>
            </SheetHeader>

            <SheetBody className="space-y-5">
              {fields.map((field, index) => (
                <Field
                  key={field.name}
                  label={field.label}
                  htmlFor={`${table}-${field.name}`}
                  required={field.required}
                  hint={field.hint}
                >
                  {field.type === "select" ? (
                    <Select
                      value={values[field.name] ?? ""}
                      onValueChange={(v) =>
                        setValues((prev) => ({ ...prev, [field.name]: v }))
                      }
                    >
                      <SelectTrigger id={`${table}-${field.name}`}>
                        <SelectValue placeholder={`Select ${field.label.toLowerCase()}`} />
                      </SelectTrigger>
                      <SelectContent>
                        {(field.options ?? []).map((o) => (
                          <SelectItem key={o.value} value={o.value}>
                            {o.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <Input
                      id={`${table}-${field.name}`}
                      type={field.type}
                      min={field.min}
                      max={field.max}
                      step={field.type === "number" ? "any" : undefined}
                      autoFocus={index === 0}
                      autoComplete="off"
                      className={field.type === "number" ? "tabular" : undefined}
                      value={values[field.name] ?? ""}
                      onChange={(e) =>
                        setValues((prev) => ({ ...prev, [field.name]: e.target.value }))
                      }
                    />
                  )}
                </Field>
              ))}

              {error && (
                <p className="rounded-md bg-destructive/10 px-3 py-2 text-[13px] font-medium text-destructive">
                  {error}
                </p>
              )}
            </SheetBody>

            <SheetFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={saving}>
                {saving && <Loader2 className="animate-spin" />}
                {editing ? "Save changes" : "Add"}
              </Button>
            </SheetFooter>
          </form>
        </SheetContent>
      </Sheet>

      <ConfirmDialog
        open={Boolean(pendingDelete)}
        onOpenChange={(next) => !next && setPendingDelete(null)}
        title={`Delete this ${title.toLowerCase().replace(/s$/, "")}?`}
        description="Records already referencing it will block the deletion. This cannot be undone."
        onConfirm={async () => {
          const result = await deleteConfig(table, String(pendingDelete!.id));
          if (result.ok) router.refresh();
          return result;
        }}
      />
    </div>
  );
}
