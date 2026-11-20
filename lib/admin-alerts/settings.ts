import "server-only";
import type { getAdminContext } from "@/lib/admin-context";
import { environmentRecipients, maskEmail, senderConfigured } from "./config";

type Database = Awaited<ReturnType<typeof getAdminContext>>["supabase"];
export type AlertRule = {
  event_key: string; label: string; description: string;
  mode: "instant" | "digest" | "off"; default_mode: "instant" | "digest"; locked: boolean;
};
export type AlertStatus = { id: string; title: string; created_at: string; status: string; last_error: string | null };
export type AlertConfig = {
  recipients: string[]; digest_enabled: boolean; digest_even_if_empty: boolean;
};

export async function alertSettings(db: Database) {
  const since = new Date(Date.now() - 86400000).toISOString();
  const [config, rules, queue, last, failed] = await Promise.all([
    db.from("admin_alert_config").select("recipients,digest_enabled,digest_even_if_empty").single(),
    db.from("admin_alert_rules").select("*").order("event_key"),
    db.from("admin_alert_queue").select("id,title,created_at,status,last_error").order("created_at", { ascending: false }).limit(10),
    db.from("admin_alert_queue").select("sent_at").eq("status", "sent").order("sent_at", { ascending: false }).limit(1).maybeSingle(),
    db.from("admin_alert_queue").select("id", { count: "exact", head: true }).eq("status", "failed").gte("failed_at", since),
  ]);
  if (config.error || rules.error || queue.error || last.error || failed.error) return null;
  return {
    config: config.data as AlertConfig, rules: rules.data as AlertRule[], queue: queue.data as AlertStatus[],
    last: last.data?.sent_at as string | undefined, failed: failed.count ?? 0,
    environment: environmentRecipients(), senderReady: senderConfigured(),
  };
}

export async function alertBadge(db: Database) {
  const { data, error } = await db.from("admin_alert_config").select("recipients").single();
  if (error) return "Not configured";
  const active: string[] = data.recipients?.length ? data.recipients : environmentRecipients();
  return active.length && senderConfigured()
    ? "On · " + maskEmail(active[0]) + (active.length > 1 ? ` +${active.length - 1}` : "")
    : "Not configured";
}
