import { getLookups } from "@/lib/data/lookups";
import { getOrganization } from "@/lib/actions/organization";
import { getCurrentProfile, requireUser } from "@/lib/supabase/server";
import { listRolesWithPermissions } from "@/lib/actions/roles";
import { listUsers } from "@/lib/actions/users";
import { listShortLinks } from "@/lib/data/short-links";
import { SettingsClient } from "./settings-client";

export const metadata = { title: "Settings" };

export default async function SettingsPage() {
  const { user } = await requireUser();
  const profile = await getCurrentProfile();

  const [lookups, orgResult, roles, users, shortLinks] = await Promise.all([
    getLookups(),
    getOrganization(),
    profile?.is_admin ? listRolesWithPermissions() : Promise.resolve([]),
    profile?.is_admin ? listUsers() : Promise.resolve([]),
    listShortLinks(),
  ]);

  return (
    <SettingsClient
      lookups={lookups}
      organization={orgResult.ok ? orgResult.data : null}
      isAdmin={profile?.is_admin ?? false}
      roles={roles}
      users={users}
      currentUserId={user.id}
      shortLinks={shortLinks}
    />
  );
}
