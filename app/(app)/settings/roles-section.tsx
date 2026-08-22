"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Lock, Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
import { ConfirmDialog } from "@/components/form/confirm-dialog";
import { RoleSheet } from "./role-sheet";
import { deleteRole } from "@/lib/actions/roles";
import { MODULES } from "@/lib/types";
import type { RoleWithPermissions } from "@/lib/types";

export function RolesSection({ roles }: { roles: RoleWithPermissions[] }) {
  const router = useRouter();
  const [sheetOpen, setSheetOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<RoleWithPermissions | null>(null);
  const [pendingDelete, setPendingDelete] = React.useState<RoleWithPermissions | null>(null);

  function summarize(role: RoleWithPermissions) {
    const active = role.permissions.filter((p) => p.can_create || p.can_read || p.can_update || p.can_delete);
    if (active.length === 0) return "No module access";
    if (active.length === MODULES.length) return "All modules";
    return `${active.length} of ${MODULES.length} modules`;
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-[14px] font-semibold">Roles</h3>
          <p className="text-[13px] text-muted-foreground">
            Create a role, then set what it can Create, Read, Update and Delete in each module.
          </p>
        </div>
        <Button
          size="sm"
          onClick={() => {
            setEditing(null);
            setSheetOpen(true);
          }}
        >
          <Plus /> New role
        </Button>
      </div>

      {roles.length === 0 ? (
        <EmptyState title="No roles yet" description="Create your first role to start assigning access." />
      ) : (
        <TableWrap>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Access</TableHead>
                <TableHead className="w-24" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {roles.map((role) => (
                <TableRow key={role.id}>
                  <TableCell className="font-medium">
                    <span className="inline-flex items-center gap-1.5">
                      {role.name}
                      {role.is_protected && (
                        <Badge variant="secondary" className="gap-1">
                          <Lock className="h-3 w-3" /> Protected
                        </Badge>
                      )}
                    </span>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{summarize(role)}</TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`Edit ${role.name}`}
                        onClick={() => {
                          setEditing(role);
                          setSheetOpen(true);
                        }}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`Delete ${role.name}`}
                        disabled={role.is_protected}
                        onClick={() => setPendingDelete(role)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableWrap>
      )}

      <RoleSheet open={sheetOpen} onOpenChange={setSheetOpen} role={editing} />

      <ConfirmDialog
        open={Boolean(pendingDelete)}
        onOpenChange={(o) => !o && setPendingDelete(null)}
        title={`Delete "${pendingDelete?.name}"?`}
        description="Any user still assigned to this role must be reassigned first, or the delete will be rejected."
        onConfirm={async () => {
          const result = await deleteRole(pendingDelete!.id);
          if (result.ok) router.refresh();
          return result;
        }}
      />
    </div>
  );
}
