"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { getAdminContext } from "@/lib/admin-context";
import { normalizeEmail } from "@/lib/admin-alerts/config";
import { deliverAlert } from "@/lib/admin-alerts/delivery";
import { createAdminClient } from "@/lib/supabase/admin";

async function deliverNow(id: string) {
  const service = createAdminClient();
  if (!service) return false;
  try {
    const outcome = await deliverAlert(service, id);
    return outcome === "sent" || (outcome === "skipped" &&
      (await service.from("admin_alert_queue").select("status").eq("id", id).single()).data?.status === "sent");
  } catch {
    return false;
  }
}

async function sendTest(db: Awaited<ReturnType<typeof getAdminContext>>["supabase"]) {
  const { data, error } = await db.rpc("admin_queue_test_alert");
  if (error || typeof data !== "string") {
    return { error: error?.message === "You can send up to three test emails per hour."
      ? error.message : "Could not queue a test email." };
  }
  return await deliverNow(data) ? {} : { error: "Test email is queued. Check delivery status for the result." };
}

export async function sendTestAlert() {
  const { supabase } = await getAdminContext();
  const result = await sendTest(supabase);
  revalidatePath("/admin/settings");
  return result;
}

export async function saveAlertRecipients(input: string[]) {
  const { supabase } = await getAdminContext();
  if (!z.array(z.string()).min(1).max(5).safeParse(input).success) return { error: "Enter one to five email addresses." };
  const recipients = input.map(normalizeEmail);
  if (recipients.includes(null) || new Set(recipients).size !== recipients.length) return { error: "Enter unique, valid email addresses." };
  const result = await supabase.rpc("admin_set_alert_recipients", { p_recipients: recipients });
  if (result.error) return { error: "Could not save email recipients." };

  revalidatePath("/admin/settings");
  revalidatePath("/admin");
  return {};
}

export async function saveAlertRule(event: string, mode: string) {
  const { supabase } = await getAdminContext();
  const { error } = await supabase.rpc("admin_set_alert_rule", { p_event_key: event, p_mode: mode });
  revalidatePath("/admin/settings");
  return error ? { error: "Could not save the alert rule." } : {};
}

export async function saveAlertDigest(enabled: boolean, evenIfEmpty: boolean) {
  const { supabase } = await getAdminContext();
  const { error } = await supabase.rpc("admin_set_alert_digest", { p_enabled: enabled, p_even_if_empty: evenIfEmpty });
  revalidatePath("/admin/settings");
  return error ? { error: "Could not save the digest settings." } : {};
}

export async function retryAlert(id: string) {
  const { supabase } = await getAdminContext();
  if (!z.uuid().safeParse(id).success) return { error: "Could not retry this alert." };
  const { data, error } = await supabase.rpc("admin_retry_alert", { p_id: id });
  if (error || !data) return { error: "This alert is no longer available for retry." };
  revalidatePath("/admin/settings");
  await deliverNow(id);
  revalidatePath("/admin/settings");
  return {};
}
