import { getLookups } from "@/lib/data/lookups";
import { SettingsClient } from "./settings-client";

export const metadata = { title: "Settings" };

export default async function SettingsPage() {
  const lookups = await getLookups();
  return <SettingsClient lookups={lookups} />;
}
