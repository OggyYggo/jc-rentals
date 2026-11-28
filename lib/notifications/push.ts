import "server-only";
import { sendNotification, setVapidDetails } from "web-push";
import { pushAgent } from "./push-egress";
import { trustedPushEndpoint } from "./push-endpoint";
import type { SupabaseClient } from "@supabase/supabase-js";

type PushNotification = { user_id: string; title: string; body: string | null; url: string | null; type: string };

function configureWebPush() {
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT;
  if (!publicKey || !privateKey || !subject) throw new Error("Web push VAPID configuration is missing.");
  setVapidDetails(subject, publicKey, privateKey);
}

export async function sendPush(db: SupabaseClient, notification: PushNotification) {
  configureWebPush();
  const { data: subscriptions, error } = await db.from("push_subscriptions").select("id,endpoint,p256dh,auth").eq("user_id", notification.user_id);
  if (error) throw error;
  if (!subscriptions?.length) return true;

  const payload = JSON.stringify({ title: notification.title, body: notification.body ?? "", url: notification.url ?? "/notifications", tag: notification.type });
  let delivered = 0;
  let attempted = 0;
  for (const subscription of subscriptions) {
    const endpoint = trustedPushEndpoint(subscription.endpoint);
    if (!endpoint) continue;
    attempted++;
    try {
      await sendNotification({ endpoint, keys: { p256dh: subscription.p256dh, auth: subscription.auth } }, payload, {
        TTL: 60 * 60 * 24, agent: pushAgent, timeout: 5000,
      });
      delivered += 1;
      await db.from("push_subscriptions").update({ last_used_at: new Date().toISOString() }).eq("id", subscription.id).eq("user_id", notification.user_id);
    } catch (error) {
      const status = typeof error === "object" && error !== null && "statusCode" in error ? Number(error.statusCode) : 0;
      if (status === 404 || status === 410) await db.from("push_subscriptions").delete().eq("id", subscription.id).eq("user_id", notification.user_id);
      else throw error;
    }
  }
  return attempted === 0 || delivered > 0;
}
