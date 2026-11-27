import { randomBytes } from "node:crypto";
import {
  channels, createCheckout, maximumTopup, minimumTopup, QuickPayError, quickpayConfig, unavailableMessage,
} from "@/lib/payments/quickpay";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

function failure(error: string, status: number) {
  return Response.json({ error }, { status });
}

export async function POST(request: Request) {
  const config = quickpayConfig();
  if (!config) return new Response(null, { status: 404 });
  const origin = new URL(request.url).origin;
  if (request.headers.get("origin") !== origin) return failure("Invalid request.", 403);

  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return failure("Sign in to top up your credits.", 401);
    const [profile, owner] = await Promise.all([
      supabase.from("profiles").select("role").eq("id", user.id).maybeSingle(),
      supabase.from("owners").select("id").eq("profile_id", user.id).eq("is_active", true).maybeSingle(),
    ]);
    if (profile.error || owner.error) return failure(unavailableMessage, 503);
    if (profile.data?.role !== "owner" || !owner.data) return failure("Only active owners can top up credits.", 403);

    const input = await request.json().catch(() => null);
    const { amount, channel: requestedChannel } = input ?? {};
    const amountMessage = `Choose a whole-peso amount between ₱${minimumTopup.toLocaleString("en-PH")} and ₱${maximumTopup.toLocaleString("en-PH")}.`;
    if (typeof amount !== "number" || !Number.isSafeInteger(amount) || amount < minimumTopup || amount > maximumTopup) {
      return failure(amountMessage, 400);
    }
    const channel = channels.find(value => value === requestedChannel);
    const channelMessage = "That payment method is not available. Try another.";
    if (requestedChannel !== undefined && !channel) return failure(channelMessage, 400);

    const admin = createAdminClient();
    if (!admin) return failure(unavailableMessage, 503);
    const orderId = `KBT-${randomBytes(6).toString("hex")}`;
    const site = process.env.VERCEL_ENV === "preview" ? origin : process.env.NEXT_PUBLIC_SITE_URL || origin;
    const cancelUrl = new URL("/owner/credits", site);
    const successUrl = new URL(cancelUrl);
    successUrl.searchParams.set("topup", orderId);
    const order = await admin.rpc("create_gateway_topup", {
      p_order_id: orderId, p_owner_id: owner.data.id, p_amount: amount,
      p_method: channel ?? null, p_livemode: config.livemode,
    });
    if (order.error) return failure(unavailableMessage, 503);
    if (!order.data) return failure("Too many payment attempts. Try again in a few minutes.", 429);

    let checkout;
    try {
      checkout = await createCheckout(config, {
        orderId, amountPesos: amount, channel, successUrl: successUrl.href, cancelUrl: cancelUrl.href,
        description: "Kuyog Bohol credit top-up",
      });
    } catch (error) {
      const code = error instanceof QuickPayError ? error.code : "unexpected_error";
      console.warn("QuickPay checkout creation failed", code);
      await admin.from("gateway_topups").update({ status: "failed" }).eq("order_id", orderId).eq("status", "created");
      if (["amount_too_small", "amount_too_large", "invalid_input"].includes(code)) return failure(amountMessage, 502);
      if (code === "channel_not_offered") return failure(channelMessage, 502);
      return failure(unavailableMessage, 503);
    }

    const saved = await admin.from("gateway_topups")
      .update({ provider_checkout_id: checkout.id, payment_url: checkout.url })
      .eq("order_id", orderId).eq("status", "created").select("id").maybeSingle();
    if (saved.error || !saved.data) return failure(unavailableMessage, 503);
    return Response.json({ url: checkout.url });
  } catch {
    return failure(unavailableMessage, 503);
  }
}
