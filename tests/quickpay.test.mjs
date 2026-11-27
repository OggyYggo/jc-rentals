import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { registerHooks } from "node:module";
import { test } from "node:test";

const orderId = "KBT-123456abcdef";
const secret = "fake-signing-secret";
const hostedUrl = "https://checkout.example/c/cs_fixture";
const checkout = { id: "cs_fixture", amount: 50_000, reference: orderId, status: "paid", livemode: false };
const row = { amount: 500, provider_checkout_id: checkout.id, status: "created", livemode: false };
const actions = [];
let reservationOutcome;
const attemptKey = "01234567-89ab-4cde-8f00-0123456789ab";
const seen = new Set();
let order = row;

globalThis.quickpayTestAdmin = {
  from(table) {
    let key;
    return {
      select() { return this; },
      abortSignal() { return this; },
      update(value) { actions.push(["update", value]); return this; },
      eq(column, value) { if (column === "event_id") key = value; return this; },
      async maybeSingle() {
        return { data: table === "gateway_webhook_events" ? seen.has(key) || null : order };
      },
    };
  },
  rpc(method, args) {
    actions.push([method, args]);
    if (method === "reserve_quickpay_checkout") {
      return Promise.resolve({ data: reservationOutcome ?? { outcome: "reserved", orderId: args.p_order_id } });
    }
    if (method === "apply_quickpay_event") {
      seen.add(args.p_event_id);
      return { async abortSignal() { return {}; } };
    }
    return Promise.resolve({ data: true });
  },
};
globalThis.quickpayTestSession = {
  auth: { getUser: async () => ({ data: { user: { id: "profile-a" } } }) },
  from(table) {
    return {
      select() { return this; },
      eq() { return this; },
      async maybeSingle() { return { data: table === "profiles" ? { role: "owner" } : { id: "owner-a" } }; },
    };
  },
};
const stubs = {
  "server-only": "",
  "@/lib/supabase/admin": "export const createAdminClient = () => globalThis.quickpayTestAdmin;",
  "@/lib/supabase/server": "export const createClient = () => globalThis.quickpayTestSession;",
};
registerHooks({
  resolve(specifier, context, nextResolve) {
    return Object.hasOwn(stubs, specifier)
      ? { shortCircuit: true, url: `data:text/javascript,${encodeURIComponent(stubs[specifier])}` }
      : nextResolve(specifier, context);
  },
});

Object.assign(process.env, {
  QUICKPAY_ENABLED: "1",
  QUICKPAY_API_KEY: "qp_test_fixture",
  QUICKPAY_WEBHOOK_SECRET: secret,
  QUICKPAY_BASE_URL: "https://quickpay.example/api/v1",
  QUICKPAY_TOPUP_MAX: "5000",
  VERCEL_ENV: "preview",
});
const { POST: create } = await import("../app/api/payments/topup/create/route.ts");
const { POST: webhook } = await import("../app/api/payments/quickpay/webhook/route.ts");

function createRequest(amount, channel) {
  return new Request("https://app.example/api/payments/topup/create", {
    method: "POST", headers: { origin: "https://app.example", "content-type": "application/json", "Idempotency-Key": attemptKey },
    body: JSON.stringify({ amount, channel, ownerId: "owner-b" }),
  });
}

function eventRequest(fields = {}, { signingSecret = secret, age = 0, modify = false } = {}) {
  const body = JSON.stringify({ id: "evt_paid", type: "checkout.paid", livemode: false, data: checkout, ...fields });
  const time = Math.floor(Date.now() / 1000) - age;
  const signature = createHmac("sha256", signingSecret).update(`${time}.${body}`).digest("hex");
  return new Request("https://app.example/api/payments/quickpay/webhook", {
    method: "POST", body: modify ? body + " " : body,
    headers: { "QuickPay-Signature": `t=${time},v1=${signature}` },
  });
}

test("both routes are disabled by the feature flag", async () => {
  process.env.QUICKPAY_ENABLED = "";
  try {
    assert.equal((await create(createRequest(500))).status, 404);
    assert.equal((await webhook(eventRequest())).status, 404);
  } finally {
    process.env.QUICKPAY_ENABLED = "1";
  }
});

test("creates a whole-peso checkout for the session owner and saves its provider ID", async t => {
  actions.length = 0;
  for (const amount of [99, 500.25, 5001, "500"]) assert.equal((await create(createRequest(amount))).status, 400);
  assert.equal((await create(createRequest(500, "card"))).status, 400);
  assert.equal(actions.length, 0);

  t.mock.method(globalThis, "fetch", async (url, init) => {
    assert.equal(url, "https://quickpay.example/api/v1/checkouts");
    const body = JSON.parse(init.body);
    assert.equal(init.headers.Authorization, "Bearer qp_test_fixture");
    assert.equal(init.headers["Idempotency-Key"], body.reference);
    assert.equal(body.amount, 50_000);
    assert.deepEqual(body.metadata, { order_id: body.reference });
    assert.equal(body.success_url, `https://app.example/owner/credits?topup=${body.reference}`);
    assert.equal(body.cancel_url, "https://app.example/owner/credits");
    assert.equal(body.expires_in_minutes, 60);
    assert.equal("channel" in body, false);
    return Response.json({ ...checkout, reference: body.reference, url: hostedUrl }, { status: 201 });
  });
  const response = await create(createRequest(500));
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { url: hostedUrl });
  assert.equal(actions[0][1].p_owner_id, "owner-a");
  assert.equal(actions[0][1].p_livemode, false);
  assert.equal(actions[0][1].p_attempt_key, attemptKey);
  assert.deepEqual(actions[1], ["update", { provider_checkout_id: checkout.id, payment_url: hostedUrl }]);
});

test("reuses stored checkouts and rejects duplicate work or mismatched details", async t => {
  const upstream = t.mock.method(globalThis, "fetch", async () => assert.fail("unexpected checkout creation"));
  try {
    reservationOutcome = { outcome: "ready", orderId, url: hostedUrl };
    assert.deepEqual(await (await create(createRequest(500))).json(), { url: hostedUrl });
    reservationOutcome = { outcome: "in_progress", orderId };
    const pending = await create(createRequest(500));
    assert.equal(pending.status, 409);
    assert.equal(pending.headers.get("Retry-After"), "3");
    reservationOutcome = { outcome: "mismatch" };
    assert.equal((await (await create(createRequest(500))).json()).code, "attempt_mismatch");
    assert.equal(upstream.mock.callCount(), 0);
  } finally {
    reservationOutcome = undefined;
  }
});

test("recovery creates a checkout using the existing upstream idempotency key", async t => {
  reservationOutcome = { outcome: "reserved", orderId };
  try {
    t.mock.method(globalThis, "fetch", async (_url, init) => {
      assert.equal(init.headers["Idempotency-Key"], orderId);
      assert.equal(JSON.parse(init.body).reference, orderId);
      return Response.json({ ...checkout, url: hostedUrl });
    });
    assert.equal((await create(createRequest(500))).status, 200);
  } finally {
    reservationOutcome = undefined;
  }
});

test("rejects invalid signatures and ignores a signed event in the wrong mode", async () => {
  actions.length = 0;
  for (const options of [{ signingSecret: "wrong" }, { age: 301 }, { modify: true }]) {
    assert.equal((await webhook(eventRequest({}, options))).status, 400);
  }
  assert.equal((await webhook(eventRequest({ livemode: true }))).status, 200);
  assert.equal(actions.length, 0);
});

test("retries unavailable confirmation, then posts the verified event and skips replays", async t => {
  actions.length = 0;
  const fetch = t.mock.method(globalThis, "fetch", async url => {
    assert.equal(url, "https://quickpay.example/api/v1/checkouts/cs_fixture");
    return Response.json(checkout);
  });
  fetch.mock.mockImplementationOnce(async () => Response.json({ error: "gateway_unavailable" }, { status: 503 }));
  assert.equal((await webhook(eventRequest())).status, 500);
  assert.equal(actions.length, 0);
  for (let attempt = 0; attempt < 4; attempt++) assert.equal((await webhook(eventRequest())).status, 200);
  assert.equal(fetch.mock.callCount(), 2);
  assert.equal(actions.length, 1);
  assert.equal(actions[0][1].p_action, "post");
});

test("sends mismatches to review and handles nested extra payments and expiry", async t => {
  actions.length = 0;
  t.mock.method(globalThis, "fetch", async () => Response.json({ ...checkout, amount: 49_900 }));
  assert.equal((await webhook(eventRequest({ id: "evt_mismatch" }))).status, 200);
  assert.equal((await webhook(eventRequest({
    id: "evt_extra", type: "checkout.extra_payment", data: { checkout, payment: { amount: 50_000 } },
  }))).status, 200);
  assert.equal((await webhook(eventRequest({ id: "evt_expired", type: "checkout.expired" }))).status, 200);
  order = null;
  try {
    assert.equal((await webhook(eventRequest({ id: "evt_unknown" }))).status, 200);
  } finally {
    order = row;
  }
  assert.deepEqual(actions.map(([, args]) => args.p_action), ["review", "extra", "expire"]);
});
