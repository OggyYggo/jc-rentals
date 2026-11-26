import { randomBytes } from "node:crypto";
import {
  bayadgateConfig, bayadgateEnabled, createPayment, maximumTopup,
  minimumTopup, paymentMethods, readPaymentBody, validTopupMaximum,
} from "@/lib/payments/bayadgate";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const errorResponse = (error: string, status: number) => Response.json({ error }, { status });

export async function POST(request: Request) {
  if (!bayadgateEnabled()) return new Response(null, { status: 404 });
  const unavailable = () => errorResponse("Online payment is temporarily unavailable. Please try again.", 503);
  try {
    const origin = process.env.VERCEL_ENV === "preview" && process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : new URL(request.url).origin;
    if (request.headers.get("origin") !== origin) return errorResponse("Invalid request.", 403);

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return errorResponse("Sign in to top up your credits.", 401);
    const [profile, owner] = await Promise.all([
      supabase.from("profiles").select("role").eq("id", user.id).maybeSingle(),
      supabase.from("owners").select("id").eq("profile_id", user.id).eq("is_active", true).maybeSingle(),
    ]);
    if (profile.error || owner.error) return unavailable();
    if (profile.data?.role !== "owner" || !owner.data) return errorResponse("Only active owners can top up credits.", 403);

    const input = await readPaymentBody(request).catch(() => null) as { amount?: unknown; method?: unknown } | null;
    const amount = input?.amount;
    const method = paymentMethods.find(value => value === input?.method);
    if (!validTopupMaximum) return unavailable();
    if (typeof amount !== "number" || !Number.isInteger(amount) || amount < minimumTopup || amount > maximumTopup) {
      return errorResponse(`Enter a whole-peso amount from ₱${minimumTopup} to ₱${maximumTopup.toLocaleString("en-PH")}.`, 400);
    }
    if (!method) return errorResponse("Choose GCash, Maya, or GoTyme.", 400);

    const admin = createAdminClient();
    const config = bayadgateConfig();
    if (!admin || !config) return unavailable();

    const orderId = `KBT-${randomBytes(6).toString("hex")}`;
    const order = await admin.rpc("create_gateway_topup", {
      p_order_id: orderId, p_owner_id: owner.data.id, p_amount: amount, p_method: method,
    });
    if (order.error) return unavailable();
    if (order.data === false) return errorResponse("Too many payment attempts. Try again in a few minutes.", 429);
    if (order.data !== true) return unavailable();

    const redirectUrl = new URL("/owner/credits", origin);
    redirectUrl.searchParams.set("topup", orderId);
    const paymentUrl = await createPayment(config, { orderId, amount, method, redirectUrl: redirectUrl.href })
      .catch(() => null);
    const updated = await admin.from("gateway_topups")
      .update(paymentUrl ? { payment_url: paymentUrl } : { status: "failed" })
      .eq("order_id", orderId).eq("status", "created").select("id").maybeSingle();
    if (!paymentUrl || updated.error || !updated.data) return unavailable();
    return Response.json({ paymentUrl });
  } catch {
    return unavailable();
  }
}
