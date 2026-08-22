"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2, Lock } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Field } from "@/components/form/field";
import { createRole, renameRole, saveRolePermissions } from "@/lib/actions/roles";
import { MODULES, CRUD_ACTIONS } from "@/lib/types";
import type { RoleWithPermissions, PermissionGrid } from "@/lib/types";

const EMPTY_GRID: PermissionGrid = MODULES.map((m) => ({
  module: m.value,
  can_create: false,
  can_read: false,
  can_update: false,
  can_delete: false,
}));

export function RoleSheet({
  open,
  onOpenChange,
  role,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  role: RoleWithPermissions | null;
}) {
  const router = useRouter();
  const isEdit = Boolean(role);
  const protectedRole = role?.is_protected ?? false;

  const [name, setName] = React.useState("");
  const [grid, setGrid] = React.useState<PermissionGrid>(EMPTY_GRID);
  const [nameError, setNameError] = React.useState<string | null>(null);
  const [serverError, setServerError] = React.useState<string | null>(null);
  const [submitting, setSubmitting] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    setServerError(null);
    setNameError(null);
    setName(role?.name ?? "");
    setGrid(role?.permissions ?? EMPTY_GRID);
  }, [open, role]);

  function toggle(moduleValue: string, key: keyof Omit<PermissionGrid[number], "module">) {
    setGrid((g) => g.map((row) => (row.module === moduleValue ? { ...row, [key]: !row[key] } : row)));
  }

  function toggleColumn(key: keyof Omit<PermissionGrid[number], "module">) {
    setGrid((g) => {
      const allOn = g.every((row) => row[key]);
      return g.map((row) => ({ ...row, [key]: !allOn }));
    });
  }

  function toggleRow(moduleValue: string) {
    setGrid((g) => {
      const row = g.find((r) => r.module === moduleValue)!;
      const allOn = row.can_create && row.can_read && row.can_update && row.can_delete;
      return g.map((r) =>
        r.module === moduleValue
          ? { ...r, can_create: !allOn, can_read: !allOn, can_update: !allOn, can_delete: !allOn }
          : r,
      );
    });
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setServerError(null);
    setNameError(null);

    if (!name.trim()) {
      setNameError("Name is required");
      return;
    }

    setSubmitting(true);
    try {
      let roleId = role?.id;

      if (isEdit) {
        if (name !== role!.name) {
          const renamed = await renameRole({ id: roleId, name });
          if (!renamed.ok) {
            setServerError(renamed.error);
            return;
          }
        }
      } else {
        const created = await createRole({ name });
        if (!created.ok) {
          setServerError(created.error);
          return;
        }
        roleId = created.data.id;
      }

      if (!protectedRole && roleId) {
        const saved = await saveRolePermissions({ role_id: roleId, permissions: grid });
        if (!saved.ok) {
          setServerError(saved.error);
          return;
        }
      }

      toast.success(isEdit ? "Role updated" : "Role created");
      router.refresh();
      onOpenChange(false);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-xl">
        <form onSubmit={onSubmit} className="flex h-full flex-col">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              {isEdit ? "Edit role" : "New role"}
              {protectedRole && (
                <Badge variant="secondary" className="gap-1">
                  <Lock className="h-3 w-3" /> Protected
                </Badge>
              )}
            </SheetTitle>
            <SheetDescription>
              {protectedRole
                ? "Administrator always has full access to every module and can't be changed or deleted — this guarantees at least one account always has full access."
                : "Choose what this role can do in each module. A module left fully unchecked is invisible to anyone with this role."}
            </SheetDescription>
          </SheetHeader>

          <SheetBody className="space-y-5">
            <Field label="Role name" htmlFor="role-name" required error={nameError ?? undefined}>
              <Input
                id="role-name"
                autoFocus
                autoComplete="off"
                disabled={protectedRole}
                placeholder="e.g. Data Entry Staff"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </Field>

            <div>
              <div className="mb-2 flex items-center justify-between">
                <span className="text-[13px] font-medium">Permissions</span>
              </div>
              <div className="overflow-x-auto rounded-md border">
                <table className="w-full text-[13px]">
                  <thead>
                    <tr className="border-b bg-muted/40">
                      <th className="px-3 py-2 text-left font-medium">Module</th>
                      {CRUD_ACTIONS.map((a) => {
                        const allOn = grid.every((row) => row[a.key]);
                        return (
                          <th key={a.key} className="px-2 py-2 text-center font-medium">
                            <div className="flex flex-col items-center gap-1">
                              <span>{a.label}</span>
                              <Checkbox
                                checked={allOn}
                                disabled={protectedRole}
                                onCheckedChange={() => toggleColumn(a.key)}
                                aria-label={`Select all ${a.label}`}
                                title={`Select ${a.label} for every module`}
                              />
                            </div>
                          </th>
                        );
                      })}
                    </tr>
                  </thead>
                  <tbody>
                    {MODULES.map((m) => {
                      const row = grid.find((r) => r.module === m.value)!;
                      return (
                        <tr key={m.value} className="border-b last:border-0">
                          <td className="px-3 py-2">
                            <button
                              type="button"
                              disabled={protectedRole}
                              onClick={() => toggleRow(m.value)}
                              className="text-left underline-offset-2 hover:underline disabled:no-underline"
                              title="Toggle every permission for this module"
                            >
                              {m.label}
                            </button>
                          </td>
                          {CRUD_ACTIONS.map((a) => (
                            <td key={a.key} className="px-2 py-2 text-center">
                              <Checkbox
                                checked={row[a.key]}
                                disabled={protectedRole}
                                onCheckedChange={() => toggle(m.value, a.key)}
                                aria-label={`${a.label} on ${m.label}`}
                              />
                            </td>
                          ))}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <p className="mt-2 text-[12px] text-muted-foreground">
                Adding a new student also requires Create on Academic Records/Grades — the "add
                student" flow creates the student and their first year's enrollment together.
              </p>
            </div>

            {serverError && (
              <p className="rounded-md bg-destructive/10 px-3 py-2 text-[13px] font-medium text-destructive">
                {serverError}
              </p>
            )}
          </SheetBody>

          <SheetFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting && <Loader2 className="animate-spin" />}
              {isEdit ? "Save changes" : "Create role"}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}
