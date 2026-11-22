import "server-only";
import { getCurrentOrigin } from "@/lib/promo/origin";

export async function pickupOrigin() {
  const configured = process.env.NEXT_PUBLIC_SITE_URL;
  const origin = new URL(configured || await getCurrentOrigin());
  if (origin.protocol === "https:" && configured) return origin.origin;
  if (process.env.NODE_ENV !== "production" && ["localhost", "127.0.0.1", "[::1]"].includes(origin.hostname)) return origin.origin;
  return null;
}

export async function pickupOrigins() {
  const canonical = await pickupOrigin().catch(() => null);
  const previews = (process.env.PICKUP_PREVIEW_ORIGINS ?? "").split(",").flatMap(value => {
    try {
      const url = new URL(value.trim());
      return url.protocol === "https:" && !url.username && !url.password ? [url.origin] : [];
    } catch { return []; }
  });
  return [...new Set([...(canonical ? [canonical] : []), ...previews])];
}
