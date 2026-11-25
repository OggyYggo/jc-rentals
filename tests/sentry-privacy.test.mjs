import assert from "node:assert/strict";
import { test } from "node:test";
import { monitoringOptions } from "../lib/monitoring/sentry.ts";

test("Sentry receives generated code positions without event text, user, request, or private paths", () => {
  const { beforeSend } = monitoringOptions(undefined, "client");
  const event = beforeSend({
    type: undefined,
    event_id: "synthetic-event",
    message: "private test message",
    user: { id: "private test ID" },
    request: { url: "https://example.invalid/account/private" },
    exception: { values: [{
      type: "Custom private type",
      value: "private document path",
      stacktrace: { frames: [
        { filename: "https://example.invalid/account/private?id=synthetic", lineno: 1 },
        { filename: "https://example.invalid/_next/static/chunks/app.js?private=synthetic", function: "private name", lineno: 10, colno: 2 },
      ] },
    }] },
  });
  assert.deepEqual(JSON.parse(JSON.stringify(event)), {
    event_id: "synthetic-event",
    level: "error",
    tags: { runtime: "client" },
    exception: { values: [{
      type: "Error",
      value: "Application error in browser",
      stacktrace: { frames: [{ filename: "app.js", lineno: 10, colno: 2, in_app: true }] },
    }] },
  });
});
