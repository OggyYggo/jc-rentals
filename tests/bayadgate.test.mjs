import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { test } from "node:test";

const merchant = "merchant-fixture";
const secret = "sk_test_sandbox-fixture";
const orderId = "KBT-123456abcdef";
const ownerId = "owner-a";
const state = { status: "created", amount: 500, created_at: new Date().toISOString() };
let calls = [];

globalThis.bayadgateTestDb = {
  from() { return this; },
  select() { return this; },
  eq(key, value) { calls.push([key, value]); return this; },
  update(value) { calls.push(["update", value]); return this; },
  async maybeSingle() { return { data: state }; },
  async rpc(method, args) {
    calls.push([method, args]);
    if (method === "create_gateway_topup") return { data: true };
    if (method === "post_gateway_topup") {
      state.status = "paid";
      return { data: "paid" };
    }
    return {};
  },
};

const serverStub = `
  export function createClient() {
    return {
      auth: { getUser: async () => ({ data: { user: { id: 'profile-a' } } }) },
      from(table) {
        return {
          select() { return this; },
          eq() { return this; },
          async maybeSingle() {
            return { data: table === 'profiles' ? { role: 'owner' } : { id: 'owner-a' } };
          }
        };
      }
    };
  }
`;

registerHooks({
  resolve(specifier, context, nextResolve) {
    const stubs = {
      "server-only": "",
      "@/lib/supabase/admin": "export const createAdminClient = () => globalThis.bayadgateTestDb;",
      "@/lib/supabase/server": serverStub,
    };
    return Object.hasOwn(stubs, specifier)
      ? { shortCircuit: true, url: `data:text/javascript,${encodeURIComponent(stubs[specifier])}` }
      : nextResolve(specifier, context);
  },
});

process.env.BAYADGATE_MERCHANT_ID = merchant;
process.env.BAYADGATE_SECRET_KEY = secret;
process.env.BAYADGATE_BASE_URL = "https://gateway.example/api";
process.env.BAYADGATE_TOPUP_MAX = "5000";
process.env.VERCEL_ENV = "preview";
delete process.env.VERCEL_URL;

const { bayadgateConfig, createPayment, sign } = await import("../lib/payments/bayadgate.ts");
const { POST: callback } = await import("../app/api/payments/bayadgate/callback/route.ts");
const { POST: create } = await import("../app/api/payments/bayadgate/create/route.ts");

function webhook(fields = {}, signature) {
  const body = { merchant_id: merchant, order_id: orderId, amount: "500.00", status: "5", ...fields };
  return new Request("https://app.example/api/payments/bayadgate/callback", {
    method: "POST", body: new URLSearchParams({ ...body, sign: signature ?? sign(body, secret) }),
  });
}

test("BayadGate routes stay off without the flag and in Vercel Production", async () => {
  process.env.BAYADGATE_ENABLED = "";
  assert.equal((await callback(webhook())).status, 404);
  assert.equal((await create(webhook())).status, 404);
  process.env.BAYADGATE_ENABLED = "1";
  process.env.VERCEL_ENV = "production";
  assert.equal((await callback(webhook())).status, 404);
  assert.equal((await create(webhook())).status, 404);
  process.env.VERCEL_ENV = "preview";
});

test("checkout validates amounts and takes owner identity from the session", async t => {
  const request = (amount, method = "GCASH") => new Request("https://app.example/api/payments/bayadgate/create", {
    method: "POST", headers: { origin: "https://app.example", "content-type": "application/json" },
    body: JSON.stringify({ amount, method, ownerId: "owner-b" }),
  });
  calls = [];
  for (const invalid of [0, 500.25, 5001]) assert.equal((await create(request(invalid))).status, 400);
  assert.equal((await create(request(500, "CARD"))).status, 400);
  assert.deepEqual(calls, []);

  t.mock.method(globalThis, "fetch", async (url, options) => {
    assert.equal(url, "https://gateway.example/api/checkout");
    const fields = Object.fromEntries(options.body);
    assert.equal(fields.amount, "500.00");
    assert.equal(fields.redirect_url, `https://app.example/owner/credits?topup=${fields.order_id}`);
    assert.equal(fields.sign, sign(fields, secret));
    return Response.json({
      livemode: false,
      checkout_url: "https://gateway.example/checkout/sandbox-invoice",
    });
  });
  assert.equal((await create(request(500))).status, 200);
  assert.equal(calls.find(([name]) => name === "create_gateway_topup")[1].p_owner_id, ownerId);
});

test("checkout rejects live credentials and live or unmarked responses", async t => {
  process.env.BAYADGATE_SECRET_KEY = "sk_live_fixture";
  assert.equal(bayadgateConfig(), null);
  process.env.BAYADGATE_SECRET_KEY = secret;

  const config = bayadgateConfig();
  const payment = { orderId, amount: 500, method: "GCASH", redirectUrl: "https://app.example/owner/credits" };
  let livemode = true;
  t.mock.method(globalThis, "fetch", async () =>
    Response.json({ livemode, checkout_url: "https://gateway.example/checkout/invoice" }));
  await assert.rejects(createPayment(config, payment), /Could not start payment/);
  livemode = undefined;
  await assert.rejects(createPayment(config, payment), /Could not start payment/);
});

test("a confirmed callback posts once, and replay returns SUCCESS", async t => {
  calls = [];
  const provider = t.mock.method(globalThis, "fetch", async () =>
    Response.json({ order_id: orderId, amount: "500.00", status: "5" }));
  for (let attempt = 0; attempt < 4; attempt++) {
    const result = await callback(webhook());
    assert.equal(result.status, 200);
    assert.equal(await result.text(), "SUCCESS");
  }
  assert.equal(provider.mock.callCount(), 1);
  assert.equal(calls.filter(([name]) => name === "post_gateway_topup").length, 1);
});

test("invalid, unknown, and expired payments are never posted", async t => {
  state.status = "created";
  calls = [];
  const provider = t.mock.method(globalThis, "fetch", async () => Response.json({ status: "SUCCESS" }));
  const validSignature = sign({ merchant_id: merchant, order_id: orderId, amount: "500.00", status: "5" }, secret);
  for (const request of [
    webhook({ amount: "501.00" }, validSignature), webhook({ amount: "500.01" }),
    webhook({ merchant_id: "wrong" }), webhook({ status: "1" }), webhook({}, "0".repeat(32)),
    webhook({ extra: "x".repeat(4096) }),
  ]) assert.equal((await callback(request)).status, 400);
  t.mock.method(globalThis.bayadgateTestDb, "maybeSingle", async () => ({ data: null }));
  assert.equal((await callback(webhook({ order_id: "KBT-ffffffffffff" }))).status, 400);
  globalThis.bayadgateTestDb.maybeSingle.mock.restore();
  assert.equal(provider.mock.callCount(), 0);

  assert.equal((await callback(webhook())).status, 400);
  state.status = "expired";
  assert.equal((await callback(webhook())).status, 400);
  assert.equal(provider.mock.callCount(), 1);
  assert.equal(calls.filter(([name]) => name === "review_gateway_callback").length, 2);
  assert.equal(calls.some(([name]) => name === "post_gateway_topup"), false);
});
