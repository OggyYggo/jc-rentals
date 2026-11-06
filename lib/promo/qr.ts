import "server-only";
import QRCode from "qrcode";

export function getSiteOrigin(fallback = "http://localhost:3000") {
  return (process.env.NEXT_PUBLIC_SITE_URL || fallback).replace(/\/$/, "");
}

export function carShortUrl(code: string, src: string, origin = getSiteOrigin()) {
  return `${origin}/c/${encodeURIComponent(code)}?src=${encodeURIComponent(src)}`;
}

export function normalizePromoSource(value: string | null | undefined) {
  const allowed = new Set(["post", "story", "poster", "sticker", "cover", "share"]);
  return value && allowed.has(value) ? value : "share";
}

export async function qrDataUrl(url: string, size = 600) {
  return QRCode.toDataURL(url, {
    errorCorrectionLevel: "M",
    margin: 2,
    width: size,
    color: { dark: "#0A3D91", light: "#FFFFFF" },
  });
}
