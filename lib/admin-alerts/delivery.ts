import "server-only";
import type { createAdminClient } from "@/lib/supabase/admin";
import { environmentRecipients } from "./config";
import { sendAlert, type ClaimedAlert } from "./mail";

type AlertDatabase = NonNullable<ReturnType<typeof createAdminClient>>;

export async function deliverAlert(db: AlertDatabase, id: string) {
  const { data, error } = await db.rpc("claim_admin_alert", { p_id: id, p_environment_recipients: environmentRecipients() });
  if (error) throw new Error("Could not claim email alert.");
  const claim = (data as ClaimedAlert[] | null)?.[0];
  if (!claim) return "skipped" as const;
  const failure = await sendAlert(claim);
  const finished = await db.rpc("finish_admin_alert", { p_id: id, p_token: claim.lease_token, p_error: failure });
  if (finished.error || !finished.data) throw new Error("Could not record email alert delivery.");
  return failure ? "failed" as const : "sent" as const;
}

export async function queueSubmissionAlert(db: AlertDatabase, event: "application.submitted" | "contact.message", id: string) {
  const application = event === "application.submitted";
  try {
    const { error } = await db.rpc("admin_alert", {
      p_event_key: event,
      p_title: application ? "New owner application" : "New contact message",
      p_body: application ? "An application is ready for review." : "A contact form submission is waiting for review.",
      p_url: application ? "/admin/owner-applications" : "/admin/contact-messages",
      p_dedupe: `${event}:${id}`,
    });
    if (error) console.error("Could not queue admin email alert", event, error.code);
  } catch {
    console.error("Could not queue admin email alert", event);
  }
}
