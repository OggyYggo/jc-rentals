import {
  bayadgateConfig, bayadgateEnabled, callbackParameters, expiryCutoff,
  matchesAmount, orderPattern, queryStatus, readPaymentBody, verifySign,
} from "@/lib/payments/bayadgate";
import { createAdminClient } from "@/lib/supabase/admin";

const rejected = () => new Response("Invalid or unconfirmed payment", { status: 400 });
const accepted = () => new Response("SUCCESS", { headers: { "Content-Type": "text/plain" } });

export async function POST(request: Request) {
  if (!bayadgateEnabled()) return new Response(null, { status: 404 });
  try {
    const config = bayadgateConfig();
    const admin = createAdminClient();
    if (!config || !admin) return rejected();

    const params = callbackParameters(await readPaymentBody(request));
    if (params.merchant_id !== config.merchantId || !verifySign(params, config.secret) ||
        !orderPattern.test(params.order_id) || params.status !== "5") return rejected();

    const { data: order, error } = await admin.from("gateway_topups")
      .select("amount,status,created_at").eq("order_id", params.order_id)
      .eq("provider", "bayadgate").maybeSingle();
    if (error || !order || !matchesAmount(params.amount, Number(order.amount))) return rejected();
    if (order.status === "paid") return accepted();

    const args = { p_order_id: params.order_id };
    if (order.status !== "created" || Date.parse(order.created_at) <= Date.parse(expiryCutoff())) {
      await admin.rpc("review_gateway_callback", args);
      return rejected();
    }

    const status = await queryStatus(config, params.order_id, Number(order.amount));
    if (status === "not_paid") return rejected();
    if (status === "paid") {
      const posted = await admin.rpc("post_gateway_topup", { ...args, p_amount: Number(order.amount) });
      if (!posted.error && (posted.data === "paid" || posted.data === "already_paid")) return accepted();
    }
    await admin.rpc("review_gateway_callback", args);
    return rejected();
  } catch {
    return rejected();
  }
}
