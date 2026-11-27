import { getCheckout, matchesOrder, orderPattern, QuickPayError, quickpayConfig, verifyWebhook } from "@/lib/payments/quickpay";
import { createAdminClient } from "@/lib/supabase/admin";

type EventCheckout = {
  id?: string;
  amount?: number;
  reference?: string;
  metadata?: { order_id?: string };
};

export async function POST(request: Request) {
  const config = quickpayConfig();
  if (!config) return new Response(null, { status: 404 });
  const badRequest = () => new Response(null, { status: 400 });
  const retry = () => new Response(null, { status: 500 });
  const accepted = () => new Response(null, { status: 200 });

  const rawBody = await request.text().catch(() => null);
  if (rawBody === null || !verifyWebhook(rawBody, request.headers.get("QuickPay-Signature"), config.secret)) {
    return badRequest();
  }
  let event;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return badRequest();
  }
  if (typeof event?.id !== "string" || !event.id || typeof event.type !== "string" || !event.type ||
      typeof event.livemode !== "boolean" || !event.data || typeof event.data !== "object" ||
      Array.isArray(event.data)) return badRequest();
  if (event.livemode !== config.livemode) {
    console.warn("QuickPay webhook ignored: wrong mode");
    return accepted();
  }

  if (!["checkout.paid", "checkout.expired", "checkout.extra_payment"].includes(event.type)) return accepted();
  const checkout: EventCheckout = event.type === "checkout.extra_payment" ? event.data.checkout : event.data;
  const orderId = checkout?.metadata?.order_id ?? checkout?.reference;
  if (typeof orderId !== "string" || !orderPattern.test(orderId)) {
    console.warn("QuickPay webhook ignored: unknown order");
    return accepted();
  }
  const admin = createAdminClient();
  if (!admin) return retry();
  const deadline = AbortSignal.timeout(9000);
  const [seen, order] = await Promise.all([
    admin.from("gateway_webhook_events").select("event_id").eq("provider", "quickpay")
      .eq("event_id", event.id).abortSignal(deadline).maybeSingle(),
    admin.from("gateway_topups").select("amount,provider_checkout_id,status,livemode")
      .eq("order_id", orderId).eq("provider", "quickpay").abortSignal(deadline).maybeSingle(),
  ]);
  if (seen.error || order.error) return retry();
  if (seen.data) return accepted();
  if (!order.data || order.data.livemode !== config.livemode) {
    console.warn("QuickPay webhook ignored: unknown order or wrong order mode");
    return accepted();
  }
  const row = order.data;
  // A delivery may race the checkout create response and its database write.
  if (!row.provider_checkout_id && row.status === "created") return retry();
  const identityMatches = Boolean(row.provider_checkout_id) && checkout.id === row.provider_checkout_id &&
    matchesOrder(checkout, orderId);
  const pesos = Number(row.amount);
  let action = "ignore";
  if (event.type === "checkout.expired" && identityMatches) action = "expire";
  if (event.type === "checkout.extra_payment" && identityMatches) action = "extra";
  if (event.type === "checkout.paid") {
    action = "review";
    if (identityMatches && checkout.amount === pesos * 100 && typeof checkout.id === "string") {
      try {
        const confirmed = await getCheckout(config, checkout.id, AbortSignal.any([deadline, AbortSignal.timeout(7000)]));
        if (confirmed.status === "paid" && confirmed.livemode === config.livemode &&
            confirmed.id === checkout.id && confirmed.amount === pesos * 100 && matchesOrder(confirmed, orderId)) {
          action = "post";
        }
      } catch (error) {
        if (!(error instanceof QuickPayError) || error.status !== 404 || error.code !== "not_found") return retry();
      }
    }
  }

  const result = await admin.rpc("apply_quickpay_event", {
    p_event_id: event.id, p_type: event.type, p_order_id: orderId, p_action: action,
    p_amount: pesos, p_checkout_id: row.provider_checkout_id, p_livemode: config.livemode,
  }).abortSignal(deadline);
  return result.error ? retry() : accepted();
}
