import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";

export const channels = ["gcash", "maya", "gotyme"] as const;
export const orderPattern = /^KBT-[a-f0-9]{12}$/;
export const minimumTopup = 100;
export const maximumTopup = Number(process.env.QUICKPAY_TOPUP_MAX || 5000);
export const unavailableMessage = "Online payment is temporarily unavailable. Please try again or use the QR top-up below.";

let warned = false;
export function quickpayConfig() {
  if (process.env.QUICKPAY_ENABLED !== "1") return null;
  const key = process.env.QUICKPAY_API_KEY ?? "";
  const secret = process.env.QUICKPAY_WEBHOOK_SECRET;
  const validKey = /^qp_(test|live)_.+/.test(key);
  const livemode = key.startsWith("qp_live_");
  if (!validKey || !secret || !Number.isSafeInteger(maximumTopup) || maximumTopup < minimumTopup || maximumTopup > 50_000) {
    if (!warned) console.warn("QuickPay disabled because its configuration is invalid.");
    warned = true;
    return null;
  }
  // Simulated payments must never post credits on the production deployment.
  if (!livemode && process.env.VERCEL_ENV === "production") return null;
  const base = URL.parse(process.env.QUICKPAY_BASE_URL || "https://quickpayph.com/api/v1");
  if (!base || base.protocol !== "https:" || base.username || base.password || base.search || base.hash) return null;
  return { key, secret, livemode, base: base.href.replace(/\/$/, "") };
}

type Config = NonNullable<ReturnType<typeof quickpayConfig>>;
type Checkout = {
  id: string;
  url: string;
  livemode: boolean;
  status: string;
  amount: number | null;
  reference?: string;
  metadata?: { order_id?: string };
  qr?: { channel?: string };
};

export class QuickPayError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, status: number) {
    super("QuickPay request failed");
    this.code = code;
    this.status = status;
  }
}

const knownCodes = new Set([
  "amount_too_small", "amount_too_large", "invalid_input", "channel_not_offered",
  "account_not_active", "daily_received_limit", "too_many_attempts", "rate_limited",
  "gateway_unavailable", "not_found", "in_progress", "no_qr", "amount_mismatch",
]);

async function send(config: Config, path: string, status: number[], options?: RequestInit): Promise<Checkout> {
  try {
    const response = await fetch(config.base + path, {
      ...options,
      headers: { ...options?.headers, Authorization: `Bearer ${config.key}` },
      signal: options?.signal ?? AbortSignal.timeout(10_000),
      redirect: "error",
      cache: "no-store",
    });
    const result = await response.json().catch(() => null);
    if (!status.includes(response.status)) {
      const code = knownCodes.has(result?.error) ? result.error : "upstream_error";
      throw new QuickPayError(code, response.status);
    }
    if (!result || typeof result.id !== "string" || !result.id ||
        typeof result.livemode !== "boolean" || typeof result.status !== "string") {
      throw new QuickPayError("invalid_response", 502);
    }
    return result;
  } catch (error) {
    if (error instanceof QuickPayError) throw error;
    throw new QuickPayError("network_error", 503);
  }
}

export async function createCheckout(config: Config, input: {
  orderId: string;
  amountPesos: number;
  channel?: (typeof channels)[number];
  successUrl: string;
  cancelUrl: string;
  description: string;
}) {
  const checkout = await send(config, "/checkouts", [200, 201], {
    method: "POST",
    headers: { "Content-Type": "application/json", "Idempotency-Key": input.orderId },
    body: JSON.stringify({
      amount: input.amountPesos * 100,
      reference: input.orderId,
      description: input.description,
      success_url: input.successUrl,
      cancel_url: input.cancelUrl,
      expires_in_minutes: 60,
      metadata: { order_id: input.orderId },
      channel: input.channel,
    }),
  });
  const url = typeof checkout.url === "string" ? URL.parse(checkout.url) : null;
  if (!url || url.protocol !== "https:" || url.username || url.password ||
      checkout.livemode !== config.livemode || checkout.amount !== input.amountPesos * 100 ||
      !matchesOrder(checkout, input.orderId)) {
    throw new QuickPayError("invalid_response", 502);
  }
  return { id: checkout.id, url: checkout.url, livemode: checkout.livemode };
}

export function getCheckout(config: Config, id: string, signal?: AbortSignal) {
  return send(config, `/checkouts/${encodeURIComponent(id)}`, [200], { signal });
}

export function matchesOrder(checkout: Pick<Checkout, "metadata" | "reference">, orderId: string) {
  const metadataId = checkout.metadata?.order_id;
  return (metadataId ?? checkout.reference) === orderId &&
    (checkout.reference == null || checkout.reference === orderId);
}

export function verifyWebhook(rawBody: string, signatureHeader: string | null, secret: string) {
  const parts = Object.fromEntries((signatureHeader ?? "").split(",").map(part => part.trim().split("=", 2)));
  const { t, v1 } = parts;
  if (!/^\d+$/.test(t ?? "") || !/^[a-f0-9]{64}$/.test(v1 ?? "") ||
      Math.abs(Date.now() / 1000 - Number(t)) > 300) return false;
  const expected = Buffer.from(createHmac("sha256", secret).update(`${t}.${rawBody}`).digest("hex"));
  const actual = Buffer.from(v1);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export async function expireGatewayTopups(config: Config, ownerId: string) {
  const admin = createAdminClient();
  if (!admin) return;
  const { data } = await admin.from("gateway_topups").select("order_id,provider_checkout_id,amount")
    .eq("owner_id", ownerId).eq("provider", "quickpay").eq("livemode", config.livemode)
    .eq("status", "created").eq("needs_review", false).not("provider_checkout_id", "is", null)
    .lte("created_at", new Date(Date.now() - 60 * 60_000).toISOString())
    .order("created_at", { ascending: true }).limit(5);
  await Promise.allSettled((data ?? []).map(async row => {
    const checkout = await getCheckout(config, row.provider_checkout_id);
    if (checkout.status === "expired" && checkout.id === row.provider_checkout_id &&
        checkout.livemode === config.livemode && checkout.amount === Number(row.amount) * 100 &&
        matchesOrder(checkout, row.order_id)) {
      await admin.rpc("expire_gateway_topup", { p_order_id: row.order_id });
    }
  }));
}
