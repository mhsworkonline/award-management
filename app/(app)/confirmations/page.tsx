import { getLookups } from "@/lib/data/lookups";
import { listDataConfirmations } from "@/lib/data/confirmations";
import { ConfirmationsClient } from "./confirmations-client";

export const metadata = { title: "Confirmations" };

export default async function ConfirmationsPage() {
  const [lookups, rows] = await Promise.all([getLookups(), listDataConfirmations()]);
  return <ConfirmationsClient rows={rows} lookups={lookups} />;
}
