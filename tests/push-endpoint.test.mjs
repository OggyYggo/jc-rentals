import assert from "node:assert/strict";
import test from "node:test";
import { trustedPushEndpoint } from "../lib/notifications/push-endpoint.ts";

test("push endpoints accept supported providers over standard HTTPS", () => {
  for (const endpoint of [
    "https://fcm.googleapis.com/fcm/send/fixture",
    "https://updates.push.services.mozilla.com/wpush/v2/fixture",
    "https://web.push.apple.com/fixture",
    "https://wns2.example.notify.windows.com/fixture",
  ]) assert.equal(trustedPushEndpoint(endpoint), endpoint);
});

test("push endpoints reject untrusted hosts and unexpected URL components", () => {
  for (const endpoint of [
    "https://example.test/push",
    "https://fcm.googleapis.com.example.test/push",
    "https://updates.push.services.mozilla.com:8443/push",
    "http://fcm.googleapis.com/push",
    "https://user:password@web.push.apple.com/push",
    "https://web.push.apple.com/push#fragment",
  ]) assert.equal(trustedPushEndpoint(endpoint), null);
});
