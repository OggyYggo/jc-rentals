export function sameOriginPushRequest(request: Request, write = false) {
  const origin = request.headers.get("origin");
  const site = request.headers.get("sec-fetch-site");
  if (origin !== null) return origin === new URL(request.url).origin;
  return !write && (site === null || site === "same-origin" || site === "none");
}

export function configuredPushPublicKey() {
  return process.env.VAPID_PRIVATE_KEY && process.env.VAPID_SUBJECT ? process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "" : "";
}

const attempts = new Map<string, { count: number; expires: number }>();
const limit = 12;
const windowMs = 60_000;
const maximumTrackedUsers = 4096;

export function allowPushRegistration(userId: string, now = Date.now()) {
  const current = attempts.get(userId);
  if (current && current.expires > now) {
    if (current.count >= limit) return false;
    current.count++;
    return true;
  }
  if (attempts.size >= maximumTrackedUsers) {
    for (const [id, entry] of attempts) if (entry.expires <= now) attempts.delete(id);
    if (attempts.size >= maximumTrackedUsers) return false;
  }
  attempts.set(userId, { count: 1, expires: now + windowMs });
  return true;
}

export function pushDeviceLabel(userAgent: string | null) {
  const ua = userAgent ?? "";
  const platform = /iPad/i.test(ua) ? "iPad" : /iPhone|iPod/i.test(ua) ? "iPhone"
    : /Android/i.test(ua) ? "Android" : /Windows/i.test(ua) ? "Windows"
      : /CrOS/i.test(ua) ? "ChromeOS" : /Macintosh|Mac OS X/i.test(ua) ? "Mac" : /Linux/i.test(ua) ? "Linux" : "";
  const browser = /Edg(?:e|A|iOS)?\//i.test(ua) ? "Edge" : /Firefox|FxiOS/i.test(ua) ? "Firefox"
    : /Chrome|CriOS/i.test(ua) ? "Chrome" : /Safari/i.test(ua) ? "Safari" : "";
  const phone = ["iPad", "iPhone", "Android"].includes(platform) || /Mobile/i.test(ua);
  return { name: [browser, platform].filter(Boolean).join(" on ") || (phone ? "Phone or tablet" : "Browser device"),
    kind: phone ? "phone" as const : "computer" as const };
}
