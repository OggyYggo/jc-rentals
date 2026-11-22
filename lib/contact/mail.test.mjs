import assert from "node:assert/strict";
import { test } from "node:test";
import { contactInbox, sendContactEmail } from "./mail.ts";

test("the former example inbox falls back to the Kuyog Bohol address", () => {
  assert.equal(contactInbox(undefined), "kuyogbohol@gmail.com");
  assert.equal(contactInbox(" Support@example.com "), "kuyogbohol@gmail.com");
  assert.equal(contactInbox(" ops@example.org "), "ops@example.org");
});

test("contact mail retries provider throttling with the same key and keeps the submitter as reply-to", async (t) => {
  const originalKey = process.env.RESEND_API_KEY;
  const originalFrom = process.env.EMAIL_FROM;
  process.env.RESEND_API_KEY = "fixture";
  process.env.EMAIL_FROM = "Contact <contact@example.invalid>";
  t.after(() => {
    if (originalKey === undefined) delete process.env.RESEND_API_KEY;
    else process.env.RESEND_API_KEY = originalKey;
    if (originalFrom === undefined) delete process.env.EMAIL_FROM;
    else process.env.EMAIL_FROM = originalFrom;
  });

  let attempts = 0;
  t.mock.method(globalThis, "fetch", async (_url, request) => {
    attempts++;
    assert.equal(new Headers(request.headers).get("Idempotency-Key"), "contact/fixture/support");
    assert.deepEqual(JSON.parse(String(request.body)), {
      from: "Contact <contact@example.invalid>",
      to: ["kuyogbohol@gmail.com"],
      reply_to: "visitor@example.invalid",
      subject: "New contact message",
      text: "Fixture",
    });
    return attempts === 1 ? new Response(null, { status: 429, headers: { "Retry-After": "0" } }) : new Response(null, { status: 200 });
  });
  const message = { to: "kuyogbohol@gmail.com", replyTo: "visitor@example.invalid", subject: "New contact message", text: "Fixture", idempotencyKey: "contact/fixture/support" };
  assert.deepEqual(await sendContactEmail(message), { accepted: true });
  assert.equal(attempts, 2);

  t.mock.restoreAll();
  const permanent = t.mock.method(globalThis, "fetch", async () => new Response(null, { status: 403 }));
  assert.deepEqual(await sendContactEmail(message), { accepted: false, reason: "rejected", status: 403 });
  assert.equal(permanent.mock.callCount(), 1);

  delete process.env.EMAIL_FROM;
  assert.deepEqual(await sendContactEmail(message), { accepted: false, reason: "missing_sender" });
  assert.equal(permanent.mock.callCount(), 1);
});
