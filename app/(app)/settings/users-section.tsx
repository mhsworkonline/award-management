"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Pencil, Plus, ShieldOff } from "lucide-react";
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
import { UserSheet } from "./user-sheet";
import { revokeUserAccess } from "@/lib/actions/users";
import { formatDate } from "@/lib/utils";
import type { Role, UserRow } from "@/lib/types";

export function UsersSection({ users, roles, currentUserId }: { users: UserRow[]; roles: Role[]; currentUserId: string }) {
  const router = useRouter();
  const [sheetOpen, setSheetOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<UserRow | null>(null);
  const [pendingRevoke, setPendingRevoke] = React.useState<UserRow | null>(null);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-[14px] font-semibold">Users</h3>
          <p className="text-[13px] text-muted-foreground">
            Create a login and assign it a role. New users get a temp password you share directly.
          </p>
        </div>
        <Button
          size="sm"
          onClick={() => {
            setEditing(null);
            setSheetOpen(true);
          }}
        >
          <Plus /> New user
        </Button>
      </div>

      {users.length === 0 ? (
        <EmptyState title="No users yet" description="Create the first login for this app." />
      ) : (
        <TableWrap>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Email</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Created</TableHead>
                <TableHead className="w-24" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map((u) => (
                <TableRow key={u.id}>
                  <TableCell className="font-medium">
                    <span className="inline-flex items-center gap-1.5">
                      {u.email}
                      {u.id === currentUserId && <Badge variant="secondary">You</Badge>}
                    </span>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    <span className="inline-flex items-center gap-1.5">
                      {u.roles?.name ?? "No role"}
                      {u.is_admin && <Badge variant="warning">Admin</Badge>}
                    </span>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{formatDate(u.created_at)}</TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`Edit ${u.email}`}
                        onClick={() => {
                          setEditing(u);
                          setSheetOpen(true);
                        }}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`Revoke access for ${u.email}`}
                        disabled={u.id === currentUserId || (!u.role_id && !u.is_admin)}
                        onClick={() => setPendingRevoke(u)}
                      >
                        <ShieldOff className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableWrap>
      )}

      <UserSheet open={sheetOpen} onOpenChange={setSheetOpen} user={editing} roles={roles} />

      <ConfirmDialog
        open={Boolean(pendingRevoke)}
        onOpenChange={(o) => !o && setPendingRevoke(null)}
        title={`Revoke access for ${pendingRevoke?.email}?`}
        description="Removes their role and admin status. They can still sign in but won't be able to see or do anything, effective immediately."
        confirmLabel="Revoke access"
        onConfirm={async () => {
          const result = await revokeUserAccess(pendingRevoke!.id);
          if (result.ok) router.refresh();
          return result;
        }}
      />
    </div>
  );
}
