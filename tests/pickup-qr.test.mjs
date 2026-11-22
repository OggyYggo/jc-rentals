// node --experimental-strip-types --test tests/pickup-qr.test.mjs
import { strict as assert } from "node:assert";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import sharp from "sharp";
import decodeQr from "jsqr";
import { pickupQrMarkup } from "../lib/pickup/qr.ts";

test("the branded pickup QR decodes at the minimum screen size and export size", async () => {
  const logo = await readFile(new URL("../public/icon-512.png", import.meta.url));
  const url = `https://kuyogbohol.example/p/${"0123456789abcdef".repeat(4)}`;
  const { side, content } = pickupQrMarkup(url, `data:image/png;base64,${logo.toString("base64")}`);
  for (const size of [240, 300, 496]) {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${side} ${side}">${content}</svg>`;
    const pixels = await sharp(Buffer.from(svg)).ensureAlpha().raw().toBuffer();
    assert.equal(decodeQr(new Uint8ClampedArray(pixels), size, size)?.data, url, `QR decode at ${size}px`);
  }
});
