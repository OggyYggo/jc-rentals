import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { test } from "node:test";
import { allowPushRegistration, pushDeviceLabel } from "../lib/notifications/push-access.ts";

const accountA = "profile-a";
const accountB = "profile-b";
const phone = "https://fcm.googleapis.com/fcm/send/fixture-phone";
const laptop = "https://updates.push.services.mozilla.com/wpush/v2/fixture-laptop";
const keys = { p256dh: "A".repeat(87), auth: "B".repeat(22) };
const devices = [];
const prefs = new Map();
let user;
let nextId;

function query(table, serviceRole) {
  assert.equal(table, "push_subscriptions");
  let predicate = () => true;
  let operation = "read";
  let values;
  let columns;
  const selectRows = () => {
    const rows = devices.filter(predicate);
    if (!serviceRole) assert(rows.every(row => row.user_id === user), "session reads must be scoped to the caller");
    if (operation !== "read") assert(serviceRole, "only the service role can write subscriptions");
    if (operation === "update") rows.forEach(row => Object.assign(row, values));
    if (operation === "delete") for (const row of rows) devices.splice(devices.indexOf(row), 1);
    return rows.map(row => Object.fromEntries(columns?.split(",").map(column => [column, row[column]]) ?? Object.entries(row)));
  };
  return {
    async insert(row) {
      assert(serviceRole);
      if (devices.some(existing => existing.endpoint === row.endpoint)) return { error: { code: "23505" } };
      devices.push({ ...row, id: `00000000-0000-4000-8000-${String(++nextId).padStart(12, "0")}`, created_at: "2026-11-26T00:00:00Z", last_used_at: null });
      return { error: null };
    },
    select(value) { columns = value; return this; },
    update(next) { operation = "update"; values = next; return this; },
    delete() { operation = "delete"; return this; },
    eq(key, value) {
      const prior = predicate;
      predicate = row => prior(row) && row[key] === value;
      return this;
    },
    neq(key, value) {
      const prior = predicate;
      predicate = row => prior(row) && row[key] !== value;
      return this;
    },
    order() { return this; },
    async maybeSingle() { return { data: selectRows()[0] ?? null }; },
    then(resolve) { return Promise.resolve({ data: selectRows() }).then(resolve); },
  };
}

globalThis.pushTestAdmin = { from: table => query(table, true) };
globalThis.pushTestSession = {
  auth: { getUser: async () => ({ data: { user: user ? { id: user } : null } }) },
  from(table) {
    if (table === "notification_preferences") return {
      async upsert(row) {
        assert.equal(row.user_id, user);
        prefs.set(row.user_id, row.push_enabled);
        return {};
      },
    };
    return query(table, false);
  },
};
const stubs = {
  "@/lib/supabase/admin": "export const createAdminClient = () => globalThis.pushTestAdmin;",
  "@/lib/supabase/server": "export const createClient = () => globalThis.pushTestSession;",
};
registerHooks({
  resolve(specifier, context, nextResolve) {
    return Object.hasOwn(stubs, specifier)
      ? { shortCircuit: true, url: `data:text/javascript,${encodeURIComponent(stubs[specifier])}` }
      : nextResolve(specifier, context);
  },
});
Object.assign(process.env, {
  NEXT_PUBLIC_VAPID_PUBLIC_KEY: "fixture-public-key", VAPID_PRIVATE_KEY: "fixture-private-key", VAPID_SUBJECT: "mailto:fixture@example.invalid",
});
const subscription = await import("../app/api/push/subscribe/route.ts");
const deviceRoutes = await import("../app/api/push/devices/route.ts");
const origin = "https://app.example";

function request(route, method = "GET", body, headers = {}) {
  return new Request(origin + "/api/push/" + route, {
    method, body: body === undefined ? undefined : JSON.stringify(body),
    headers: { origin, "user-agent": "Mozilla/5.0 (Linux; Android 14) Chrome/120 Mobile Safari/537.36", ...headers },
  });
}
function put(endpoint, transfer = false, payloadKeys = keys) {
  return subscription.POST(request("subscribe", "POST", { endpoint, keys: payloadKeys, transfer }));
}
function clear() { devices.length = 0; nextId = 0; prefs.clear(); user = null; }

test("re-links a shared device only with confirmation and the stored subscription keys", async () => {
  clear();
  user = accountA;
  assert.equal((await put(phone)).status, 200);
  devices[0].last_used_at = "2026-11-27T00:00:00Z";
  user = accountB;
  const state = await subscription.GET(request("subscribe?endpoint=" + encodeURIComponent(phone)));
  assert.deepEqual(await state.json(), { state: "other", subscribed: false });
  assert.equal((await put(phone)).status, 409);
  assert.equal((await put(phone, true, { ...keys, auth: "C".repeat(22) })).status, 409);
  assert.equal(devices[0].user_id, accountA);
  assert.equal((await put(phone, true)).status, 200);
  assert.equal(devices.length, 1);
  assert.equal(devices[0].user_id, accountB);
  assert.equal(devices[0].last_used_at, null);
  assert.equal(prefs.get(accountB), true);
  user = accountA;
  assert.deepEqual(await (await deviceRoutes.GET(request("devices"))).json(), { devices: [] });
});

test("scopes device removal and preserves other push devices", async () => {
  clear();
  user = accountA;
  assert.equal((await put(phone)).status, 200);
  assert.equal((await put(laptop)).status, 200);
  devices[1].user_agent = "Firefox/122 (Windows NT 10.0)";
  const [phoneRow, laptopRow] = devices;
  const list = await (await deviceRoutes.GET(request("devices?endpoint=" + encodeURIComponent(phone)))).json();
  assert.equal(list.devices.length, 2);
  assert.deepEqual(list.devices.map(device => [device.name, device.current, device.endpoint, device.auth]), [
    ["Chrome on Android", true, undefined, undefined],
    ["Firefox on Windows", false, undefined, undefined],
  ]);
  user = accountB;
  assert.equal((await deviceRoutes.DELETE(request("devices", "DELETE", { id: laptopRow.id }))).status, 200);
  assert.equal(devices.length, 2);
  user = accountA;
  await deviceRoutes.DELETE(request("devices", "DELETE", { id: phoneRow.id, endpoint: phone }));
  assert.equal(devices.length, 2);
  await deviceRoutes.DELETE(request("devices", "DELETE", { id: laptopRow.id, endpoint: phone }));
  assert.deepEqual(devices.map(device => device.endpoint), [phone]);
  const stopped = await subscription.DELETE(request("subscribe", "DELETE", { endpoint: phone }));
  assert.deepEqual(await stopped.json(), { ok: true, removed: true });
  assert.equal(prefs.get(accountA), true);
  user = accountB;
  assert.equal((await put(phone)).status, 200);
});

test("rejects untrusted hosts, malformed subscriptions, cross-origin writes and signed-out calls", async () => {
  clear();
  const payload = { endpoint: phone, keys, transfer: true };
  assert.equal((await subscription.POST(request("subscribe", "POST", payload))).status, 401);
  assert.equal((await deviceRoutes.GET(request("devices"))).status, 401);
  user = "security-test";
  assert.equal((await subscription.POST(request("subscribe", "POST", payload, { origin: "https://wrong.example" }))).status, 403);
  assert.equal((await deviceRoutes.DELETE(request("devices", "DELETE", {}, { origin: "https://wrong.example" }))).status, 403);
  assert.equal((await deviceRoutes.GET(new Request(origin + "/api/push/devices", { headers: { "sec-fetch-site": "cross-site" } }))).status, 403);
  assert.equal((await put("https://invalid.example/endpoint", true)).status, 400);
  assert.equal((await put(phone, true, { ...keys, p256dh: "malformed" })).status, 400);
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  delete process.env.VAPID_PRIVATE_KEY;
  try {
    const unavailable = await put(phone);
    assert.equal(unavailable.status, 503);
    assert.equal((await unavailable.json()).error, "Alerts are not set up on the server yet.");
  } finally { process.env.VAPID_PRIVATE_KEY = privateKey; }
  assert.equal(devices.length, 0);
});

test("registration attempts are limited per account and device labels support Apple browsers", () => {
  for (let index = 0; index < 12; index++) assert.equal(allowPushRegistration("limited", 0), true);
  assert.equal(allowPushRegistration("limited", 1), false);
  assert.equal(allowPushRegistration("another", 1), true);
  assert.equal(allowPushRegistration("limited", 60_000), true);
  assert.deepEqual(pushDeviceLabel("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0) Version/17.0 Mobile Safari/604.1"), { name: "Safari on iPhone", kind: "phone" });
});
