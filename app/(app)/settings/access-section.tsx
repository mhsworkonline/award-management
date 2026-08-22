import { Separator } from "@/components/ui/separator";
import { RolesSection } from "./roles-section";
import { UsersSection } from "./users-section";
import type { RoleWithPermissions, UserRow } from "@/lib/types";

/** Admin-only — gated by settings-client.tsx not rendering this tab at all
 *  for a non-admin, and independently by RLS on am_roles/am_permissions/
 *  am_profiles (is_admin required for every write, see 0022's migration). */
export function AccessSection({
  roles,
  users,
  currentUserId,
}: {
  roles: RoleWithPermissions[];
  users: UserRow[];
  currentUserId: string;
}) {
  return (
    <div className="space-y-6">
      <RolesSection roles={roles} />
      <Separator />
      <UsersSection users={users} roles={roles} currentUserId={currentUserId} />
    </div>
  );
}
