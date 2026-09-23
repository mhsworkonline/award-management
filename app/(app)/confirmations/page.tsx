import { listDataConfirmations } from "@/lib/data/confirmations";
import { ConfirmationsClient } from "./confirmations-client";

export const metadata = { title: "Confirmations" };

export default async function ConfirmationsPage() {
  const rows = await listDataConfirmations();
  return <ConfirmationsClient rows={rows} />;
}
