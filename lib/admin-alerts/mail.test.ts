import assert from "node:assert/strict";
import test from "node:test";
import { adminLink, digestBody, escapeHtml, secretsMatch, sendAlert, type ClaimedAlert } from "./mail";

test("secret comparison requires a nonempty exact match", () => {
  assert.equal(secretsMatch(undefined, null), false);
  assert.equal(secretsMatch("fixture", "wrong"), false);
  assert.equal(secretsMatch("fixture", "fixturE"), false);
  assert.equal(secretsMatch("fixture", "fixture"), true);
});

test("links stay on the configured admin site and summary text is escaped", () => {
  const site = "https://example.invalid";
  assert.equal(adminLink(site, "/admin/customers"), site + "/admin/customers");
  assert.equal(adminLink(site, "/admin/../login"), site + "/admin");
  assert.equal(adminLink(site, "//example.org/admin"), site + "/admin");
  const label = "<img src=x onerror=alert(1)>";
  const body = digestBody({
    waiting: [{ label, count: 1, path: "/admin/customers" }],
    events: [], heads: [], activity: { newBookings: 0, confirmed: 0, cancelled: 0, bookedValue: 0, commission: 0 },
  }, site, "2026-11-20");
  assert.ok(body.includes(escapeHtml(label)));
  assert.doesNotMatch(body, /<img/);
});

test("Resend payload uses a stable idempotency key and stores a generic failure", async (context) => {
  const env = { RESEND_API_KEY: "fixture-key", EMAIL_FROM: "Alerts <alerts@example.invalid>", NEXT_PUBLIC_SITE_URL: "https://example.invalid" };
  for (const [key, value] of Object.entries(env)) {
    const previous = process.env[key];
    process.env[key] = value;
    context.after(() => { if (previous === undefined) delete process.env[key]; else process.env[key] = previous; });
  }
  const alert: ClaimedAlert = {
    id: "queue-fixture", title: "Fixture\nBcc: ignored", body: "<img src=x onerror=alert(1)>",
    url: "/admin", lease_token: "lease", recipient_snapshot: ["inbox@example.invalid"],
    digest_data: null, digest_on: null,
  };
  context.mock.method(globalThis, "fetch", async (url: URL | Request | string, init: RequestInit) => {
    assert.equal(url, "https://api.resend.com/emails");
    assert.equal(new Headers(init.headers).get("Idempotency-Key"), alert.id);
    assert.equal(typeof init.body, "string");
    const message = JSON.parse(String(init.body));
    assert.equal(message.subject, "[Kuyog Bohol Admin] Fixture Bcc: ignored");
    assert.deepEqual(message.to, alert.recipient_snapshot);
    assert.ok(message.html.includes("&lt;img"));
    return new Response("fixture private provider details", { status: 403 });
  });
  assert.equal(await sendAlert(alert), "Email provider rejected the request");
  assert.equal(await sendAlert({ ...alert, recipient_snapshot: [] }), "No recipients configured");
});
