import { randomBytes } from "node:crypto";
import {
  channels, createCheckout, maximumTopup, minimumTopup, orderPattern, QuickPayError, quickpayConfig, unavailableMessage,
} from "@/lib/payments/quickpay";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const attemptPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function failure(error: string, status: number, code?: string) {
  return Response.json({ error, code }, { status });
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

    const attemptKey = request.headers.get("Idempotency-Key");
    if (!attemptKey || !attemptPattern.test(attemptKey)) return failure("Reload to start a secure payment.", 400);
    const admin = createAdminClient();
    if (!admin) return failure(unavailableMessage, 503);
    const reservation = await admin.rpc("reserve_quickpay_checkout", {
      p_order_id: `KBT-${randomBytes(6).toString("hex")}`, p_owner_id: owner.data.id, p_amount: amount,
      p_method: channel ?? null, p_livemode: config.livemode, p_attempt_key: attemptKey,
    });
    if (reservation.error || !reservation.data) return failure(unavailableMessage, 503);
    const { outcome, orderId, url } = reservation.data;
    if (outcome === "rate_limited") return failure("Too many payment attempts. Try again in a few minutes.", 429);
    if (outcome === "mismatch") return failure("This payment attempt has different details.", 409, "attempt_mismatch");
    if (outcome === "closed") return failure("This payment attempt is closed. Check your credit activity.", 409, "attempt_closed");
    if (outcome === "in_progress") {
      return Response.json({ error: "Your payment is still opening. Try again in a moment." }, {
        status: 409, headers: { "Retry-After": "3" },
      });
    }
    if (outcome === "ready" && typeof url === "string") {
      const savedUrl = URL.parse(url);
      if (savedUrl?.protocol === "https:" && !savedUrl.username && !savedUrl.password) return Response.json({ url });
    }
    if (outcome !== "reserved" || typeof orderId !== "string" || !orderPattern.test(orderId)) {
      return failure(unavailableMessage, 503);
    }

    const site = process.env.VERCEL_ENV === "preview" ? origin : process.env.NEXT_PUBLIC_SITE_URL || origin;
    const cancelUrl = new URL("/owner/credits", site);
    const successUrl = new URL(cancelUrl);
    successUrl.searchParams.set("topup", orderId);
    let checkout;
    try {
      checkout = await createCheckout(config, {
        orderId, amountPesos: amount, channel, successUrl: successUrl.href, cancelUrl: cancelUrl.href,
        description: "Kuyog Bohol credit top-up",
      });
    } catch (error) {
      const code = error instanceof QuickPayError ? error.code : "unexpected_error";
      console.warn("QuickPay checkout creation failed", code);
      if (["amount_too_small", "amount_too_large", "invalid_input", "channel_not_offered"].includes(code)) {
        await admin.from("gateway_topups").update({ status: "failed" }).eq("order_id", orderId)
          .eq("status", "created").is("provider_checkout_id", null);
        return failure(code === "channel_not_offered" ? channelMessage : amountMessage, 502, "attempt_rejected");
      }
      // The provider may have received the request. Keep the order ID so
      // recovery uses its original upstream idempotency key after the lease.
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
