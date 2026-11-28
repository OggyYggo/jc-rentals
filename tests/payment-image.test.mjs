import assert from "node:assert/strict";
import { test } from "node:test";
import { paymentImage } from "../lib/payment-image.ts";
import { friendlyPaymentError } from "../lib/alerts/errors.ts";
import { normalizePaymentReference } from "../lib/payment-format.ts";

function browser(t, { encode, bitmap = true, decodes = true } = {}) {
  const calls = [];
  const canvas = {
    width: 0, height: 0,
    getContext: () => ({ fillRect() {}, drawImage() {} }),
    toBlob(callback, type, quality) {
      calls.push({ type, quality, width: this.width, height: this.height });
      callback(encode?.(type, quality, this.width) ?? new Blob(["image"], { type }));
    },
  };
  const close = t.mock.fn();
  const createBitmap = async () => {
    if (!decodes) throw new Error("Invalid image");
    return { width: 4000, height: 2400, close };
  };
  const mocks = {
    document: { createElement: () => canvas },
    createImageBitmap: bitmap ? createBitmap : undefined,
    Image: class {
      naturalWidth = 4000;
      naturalHeight = 2400;
      async decode() { if (!decodes) throw new Error("Invalid image"); }
    },
  };
  for (const [name, value] of Object.entries(mocks)) {
    const original = Object.getOwnPropertyDescriptor(globalThis, name);
    Object.defineProperty(globalThis, name, { configurable: true, value });
    t.after(() => original ? Object.defineProperty(globalThis, name, original) : delete globalThis[name]);
  }
  const revoke = t.mock.method(URL, "revokeObjectURL");
  return { calls, close, revoke, canvas };
}

test("uses the image element and JPEG when the browser returns PNG for a WebP request", async t => {
  const { calls, revoke } = browser(t, {
    bitmap: false,
    encode: type => new Blob(["image"], { type: type === "image/webp" ? "image/png" : type }),
  });
  const result = await paymentImage(new File(["screenshot"], "screenshot.png", { type: "image/png" }));
  assert.equal(result.type, "image/jpeg");
  assert.deepEqual(calls.map(({ type }) => type), ["image/webp", "image/jpeg"]);
  assert.equal(calls[0].width, 2000);
  assert.equal(revoke.mock.callCount(), 1);
});

test("accepts a large screenshot with an empty MIME type and releases the bitmap", async t => {
  const { close, canvas } = browser(t);
  const result = await paymentImage(new File([new Uint8Array(6 * 1024 * 1024)], "screenshot.png"));
  assert.equal(result.type, "image/webp");
  assert.ok(result.size < 5 * 1024 * 1024);
  assert.equal(close.mock.callCount(), 1);
  assert.equal(canvas.width, 0);
});

test("reduces quality and dimensions when the encoded image exceeds 5 MB", async t => {
  const large = new Uint8Array(5 * 1024 * 1024 + 1);
  const { calls } = browser(t, { encode: (type, quality, width) => new Blob([width === 2000 ? large : "image"], { type }) });
  assert.ok((await paymentImage(new File(["photo"], "photo.jpeg", { type: "application/octet-stream" }))).size < large.length);
  assert.deepEqual(calls.map(({ width, quality }) => [width, quality]), [[2000, 0.85], [2000, 0.7], [2000, 0.6], [1400, 0.85]]);
});

test("maps oversized, corrupt and non-image files to specific errors", async t => {
  browser(t, { decodes: false });
  await assert.rejects(paymentImage(new File(["pdf"], "proof.pdf", { type: "application/pdf" })), { code: "IMAGE_TYPE" });
  await assert.rejects(paymentImage(new File(["corrupt"], "proof.heic")), { code: "IMAGE_UNREADABLE" });
  await assert.rejects(paymentImage(new File([new Uint8Array(26 * 1024 * 1024)], "proof.png")), { code: "IMAGE_TOO_LARGE" });
  assert.match(friendlyPaymentError(new Error("IMAGE_TYPE")), /isn’t an image/);
  assert.match(friendlyPaymentError(new Error("IMAGE_UNREADABLE")), /couldn’t read/);
  assert.match(friendlyPaymentError(new Error("IMAGE_TOO_LARGE")), /too large/);
});

test("normalizes the reference examples and keeps the duplicate message specific", () => {
  for (const reference of ["GC 7K2M 9P4Q 1", "1234567890123", "MAYA12345678"]) {
    assert.match(normalizePaymentReference(reference), /^[A-Z0-9]{6,40}$/);
  }
  assert.doesNotMatch(normalizePaymentReference("12345"), /^[A-Z0-9]{6,40}$/);
  assert.match(friendlyPaymentError(new Error("REFERENCE_ALREADY_USED")), /already been used/);
});
