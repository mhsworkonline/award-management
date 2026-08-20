import { getLookups } from "@/lib/data/lookups";
import { getOrganization } from "@/lib/actions/organization";
import { SettingsClient } from "./settings-client";

export const metadata = { title: "Settings" };

export default async function SettingsPage() {
  const [lookups, orgResult] = await Promise.all([getLookups(), getOrganization()]);
  return <SettingsClient lookups={lookups} organization={orgResult.ok ? orgResult.data : null} />;
}
