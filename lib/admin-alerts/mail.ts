import { timingSafeEqual } from "node:crypto";
import { senderConfigured } from "./config";

export type CountItem = { label: string; count: number; path?: string; oldest?: string };
export type DigestData = {
  waiting: CountItem[];
  events: CountItem[];
  heads: CountItem[];
  activity: { newBookings: number; confirmed: number; cancelled: number; bookedValue: number; commission: number };
};

export function secretsMatch(expected: string | undefined, actual: string | null) {
  if (!expected || !actual) return false;
  const a = Buffer.from(expected);
  const b = Buffer.from(actual);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!);
}

export function adminLink(site: string, path: string | null = "/admin") {
  const base = new URL(site);
  if (!["https:", "http:"].includes(base.protocol) || base.username || base.password) throw new Error("Invalid site URL.");
  return new URL(path && /^\/admin(?:\/[a-z0-9_-]+)*$/i.test(path) ? path : "/admin", base.origin).href;
}

export function renderMail(title: string, body: string, link: string, button: string) {
  return `<!doctype html><html lang="en"><body style="margin:0;background:#f4f7fc;color:#16314f;font:16px system-ui,sans-serif">
  <main style="max-width:600px;margin:auto;background:white">
    <div style="background:#0B63CE;color:white;padding:20px 24px;font-weight:bold">Kuyog Bohol Admin</div>
    <div style="padding:24px"><h1 style="font-size:22px">${escapeHtml(title)}</h1>${body}
    <p style="margin:26px 0 8px"><a style="background:#0B63CE;color:white;padding:12px 16px;border-radius:6px;text-decoration:none" href="${escapeHtml(link)}">${escapeHtml(button)}</a></p>
    </div></main></body></html>`;
}

const currency = new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" });

function listSection(label: string, items: CountItem[], site: string, day: string) {
  if (!items.length) return "";
  return `<h2 style="font-size:18px">${escapeHtml(label)}</h2><ul>${items.map(item => {
    const name = escapeHtml(item.label);
    const link = item.path ? `<a href="${escapeHtml(adminLink(site, item.path))}">${name}</a>` : name;
    const oldest = item.oldest ? Date.parse(item.oldest) : NaN;
    const days = Math.max(0, Math.floor((Date.parse(day + "T08:00:00+08:00") - oldest) / 86400000));
    const age = Number.isFinite(days) ? ` (oldest: ${days === 0 ? "less than a day" : days + (days === 1 ? " day" : " days")})` : "";
    return `<li>${link} · ${Number(item.count)}${age}</li>`;
  }).join("")}</ul>`;
}

export function digestBody(digest: DigestData, site: string, day: string) {
  const a = digest.activity;
  const activity = Object.values(a).some(Boolean)
    ? `<h2 style="font-size:18px">Yesterday</h2><ul><li>New bookings · ${Number(a.newBookings)}</li>
    <li>Confirmed · ${Number(a.confirmed)}</li><li>Cancelled or expired · ${Number(a.cancelled)}</li>
    <li>Total booked value · ${currency.format(a.bookedValue)}</li><li>Commission · ${currency.format(a.commission)}</li></ul>`
    : "";
  const content = listSection("Waiting for you", digest.waiting, site, day) + activity
    + listSection("Digest events", digest.events, site, day) + listSection("Heads up", digest.heads, site, day);
  return content || "<p>There are no items waiting for review.</p>";
}

export type ClaimedAlert = {
  id: string; title: string; body: string | null; url: string | null;
  recipient_snapshot: string[] | null; lease_token: string;
  digest_data: DigestData | null; digest_on: string | null;
};

export async function sendAlert(alert: ClaimedAlert): Promise<string | null> {
  if (!alert.recipient_snapshot?.length) return "No recipients configured";
  if (!senderConfigured()) return "Email sender is not configured";
  const site = process.env.NEXT_PUBLIC_SITE_URL!;
  try {
    const digest = alert.digest_data && alert.digest_on;
    const body = digest ? digestBody(alert.digest_data!, site, digest)
      : alert.body ? `<p>${escapeHtml(alert.body)}</p>` : "";
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
        "Idempotency-Key": alert.id,
      },
      body: JSON.stringify({
        from: process.env.EMAIL_FROM,
        to: alert.recipient_snapshot,
        subject: `[Kuyog Bohol Admin] ${alert.title.replace(/[\r\n]+/g, " ").slice(0, 140)}`,
        html: renderMail(alert.title, body, adminLink(site, alert.url), digest ? "Open admin dashboard" : "Open in admin"),
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
    });
    if (response.ok) return null;
    return response.status >= 500 || response.status === 429
      ? "Email provider is unavailable" : "Email provider rejected the request";
  } catch (error) {
    return error instanceof Error && error.name === "TimeoutError" ? "Email request timed out" : "Email provider is unavailable";
  }
}
