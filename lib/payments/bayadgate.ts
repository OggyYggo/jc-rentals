import "server-only";
import { createHash, timingSafeEqual } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

export const paymentMethods = ["GCASH", "MAYA", "GOTYME"] as const;
type PaymentMethod = (typeof paymentMethods)[number];
type Parameters = Record<string, string>;

export const orderPattern = /^KBT-[A-Za-z0-9]{12}$/;
export const minimumTopup = 1;
export const maximumTopup = Number(process.env.BAYADGATE_TOPUP_MAX || 5000);
// The shared credit ledger stores amounts as numeric(10,2).
export const validTopupMaximum = Number.isSafeInteger(maximumTopup) &&
  maximumTopup >= minimumTopup && maximumTopup <= 99_999_999;

export function bayadgateEnabled() {
  return process.env.BAYADGATE_ENABLED === "1" &&
    (process.env.VERCEL_ENV === "preview" ||
      (!process.env.VERCEL_ENV && process.env.NODE_ENV !== "production"));
}

export function bayadgateConfig() {
  const merchantId = process.env.BAYADGATE_MERCHANT_ID;
  const secret = process.env.BAYADGATE_SECRET_KEY;
  if (!merchantId || !secret?.startsWith("sk_test_") || secret.length <= "sk_test_".length) return null;
  const base = new URL(process.env.BAYADGATE_BASE_URL || "https://BayadGate.com/api");
  if (base.protocol !== "https:" || base.username || base.password || base.search || base.hash) return null;
  return { merchantId, secret, base };
}

type Config = NonNullable<ReturnType<typeof bayadgateConfig>>;

export function sign(params: Parameters, secret: string) {
  const pairs = Object.keys(params).filter(key => key !== "sign" && params[key] !== "").sort();
  const canonical = pairs.map(key => `${key}=${params[key]}`).join("&");
  return createHash("md5").update(`${canonical}&key=${secret}`).digest("hex");
}

export function verifySign(params: Parameters, secret: string) {
  if (!/^[a-f0-9]{32}$/.test(params.sign ?? "")) return false;
  return timingSafeEqual(Buffer.from(params.sign, "hex"), Buffer.from(sign(params, secret), "hex"));
}

export async function readPaymentBody(request: Request): Promise<unknown> {
  const limit = 4096;
  if (Number(request.headers.get("content-length")) > limit || !request.body) throw new Error("Invalid body");
  const reader = request.body.getReader();
  const bytes = new Uint8Array(limit);
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (size + value.length > limit) {
      await reader.cancel();
      throw new Error("Invalid body");
    }
    bytes.set(value, size);
    size += value.length;
  }
  const body = new TextDecoder("utf-8", { fatal: true }).decode(bytes.subarray(0, size));
  const type = request.headers.get("content-type")?.split(";")[0].trim().toLowerCase();
  if (type === "application/json") return JSON.parse(body);
  if (type === "application/x-www-form-urlencoded") {
    const fields = new URLSearchParams(body);
    if (fields.size !== new Set(fields.keys()).size) throw new Error("Duplicate fields");
    return Object.fromEntries(fields);
  }
  throw new Error("Unsupported body");
}

export function callbackParameters(body: unknown): Parameters {
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error("Invalid callback");
  const entries = Object.entries(body).map(([key, value]) => {
    if (!/^[a-zA-Z0-9_]+$/.test(key) ||
        (typeof value !== "string" && typeof value !== "number") || String(value).includes("&")) {
      throw new Error("Invalid callback field");
    }
    return [key, String(value)];
  });
  return Object.fromEntries(entries);
}

export function matchesAmount(value: unknown, amount: number) {
  return (typeof value === "number" || typeof value === "string") &&
    /^\d{1,10}(?:\.\d{1,2})?$/.test(String(value)) && Number(value) === amount;
}

async function send(config: Config, endpoint: string, fields: Parameters) {
  const params = { merchant_id: config.merchantId, ...fields };
  const response = await fetch(`${config.base.href.replace(/\/$/, "")}/${endpoint}`, {
    method: "POST",
    body: new URLSearchParams({ ...params, sign: sign(params, config.secret) }),
    signal: AbortSignal.timeout(10_000),
    redirect: "error",
    cache: "no-store",
  });
  if (!response.ok) throw new Error("Payment provider unavailable");
  return await response.json();
}

export async function createPayment(config: Config, input: {
  orderId: string; amount: number; method: PaymentMethod; redirectUrl: string;
}) {
  const result = await send(config, "checkout", {
    order_id: input.orderId,
    amount: input.amount.toFixed(2),
    payment_method: input.method,
    redirect_url: input.redirectUrl,
  });
  if (result?.livemode !== false || typeof result.checkout_url !== "string" ||
      (result.order_id !== undefined && result.order_id !== input.orderId) ||
      (result.amount !== undefined && !matchesAmount(result.amount, input.amount))) {
    throw new Error("Could not start payment");
  }
  const url = new URL(result.checkout_url);
  if (url.origin !== config.base.origin || url.username || url.password) throw new Error("Invalid payment link");
  return url.href;
}

export async function queryStatus(config: Config, orderId: string, amount: number) {
  try {
    const result = await send(config, "query_status.php", { order_id: orderId });
    // Require an order and amount match. A generic API success flag is insufficient.
    if (result?.order_id !== orderId || !matchesAmount(result.amount, amount)) return "unknown";
    if (result.status === 5 || result.status === "5") return "paid";
    if (["pending", "unpaid", "failed", "expired", "cancelled"].includes(String(result.status).toLowerCase())) {
      return "not_paid";
    }
  } catch {
    return "unknown";
  }
  return "unknown";
}

export function expiryCutoff() {
  return new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
}

export async function expireGatewayTopups(admin: SupabaseClient, ownerId?: string) {
  const expired = admin.from("gateway_topups").update({ status: "expired" })
    .eq("status", "created").lte("created_at", expiryCutoff());
  return await (ownerId ? expired.eq("owner_id", ownerId) : expired);
}
