import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

export async function readCancellationSettings(ownerId?: string) {
  const db = createAdminClient();
  const keys = ["cancellation_policy_text", "cancellation_free_hours", "cancellation_fee_percent", "pickup_reference_hour", "refund_support_days", "deposit_percent"];
  const [settings, owner] = await Promise.all([
    db?.from("settings").select("key,value").in("key", keys),
    ownerId ? db?.from("owners").select("cancellation_free_hours,cancellation_fee_percent,deposit_percent").eq("id", ownerId).maybeSingle() : undefined,
  ]);
  if (settings?.error || owner?.error) throw new Error("Could not load cancellation policy.");
  const values = new Map(settings?.data?.map(row => [row.key, row.value]));
  return {
    policyText: typeof values.get("cancellation_policy_text") === "string" ? String(values.get("cancellation_policy_text")).trim() : "",
    hours: Number(owner?.data?.cancellation_free_hours ?? values.get("cancellation_free_hours") ?? 24),
    percent: Number(owner?.data?.cancellation_fee_percent ?? values.get("cancellation_fee_percent") ?? 50),
    pickupHour: Number(values.get("pickup_reference_hour") ?? 8),
    supportDays: Number(values.get("refund_support_days") ?? 3),
    depositRate: Number(owner?.data?.deposit_percent ?? values.get("deposit_percent") ?? 0.3),
  };
}
