import test from "node:test";
import assert from "node:assert/strict";
import { ConnectionError, fetchWithTimeout, withConnectionDeadline } from "../lib/connection/request.ts";

test("offline requests fail before sending a write", async t => {
  t.mock.getter(globalThis, "navigator", () => ({ onLine: false }));
  const fetch = t.mock.method(globalThis, "fetch");
  await assert.rejects(fetchWithTimeout("/api/write", { method: "POST" }), { kind: "offline", sent: false });
  assert.equal(fetch.mock.callCount(), 0);
});

test("timeouts abort the request and mark a sent write as uncertain", async t => {
  t.mock.method(globalThis, "fetch", (_input, { signal }) => new Promise((_, reject) => {
    signal.addEventListener("abort", () => reject(signal.reason), { once: true });
  }));
  await assert.rejects(fetchWithTimeout("/api/write", { method: "POST" }, { timeoutMs: 5 }), { kind: "timeout", sent: true });
});

test("the read deadline also covers a stalled response body", async t => {
  t.mock.method(globalThis, "fetch", async (_input, { signal }) => new Response(new ReadableStream({
    start(stream) { signal.addEventListener("abort", () => stream.error(signal.reason), { once: true }); },
  })));
  const response = await fetchWithTimeout("/api/read", {}, { timeoutMs: 5 });
  await assert.rejects(response.json(), { kind: "timeout", sent: true });
});

test("caller cancellation preserves its reason", async () => {
  const controller = new AbortController();
  const reason = new DOMException("View closed", "AbortError");
  controller.abort(reason);
  await assert.rejects(fetchWithTimeout("/api/read", { signal: controller.signal }), error => error === reason);
});

test("SDK deadline aborts the signal even when the SDK never resolves", async () => {
  let signal;
  await assert.rejects(withConnectionDeadline(value => {
    signal = value;
    return new Promise(() => {});
  }, 5), error => error instanceof ConnectionError && error.kind === "timeout" && error.sent);
  assert.equal(signal.aborted, true);
});
