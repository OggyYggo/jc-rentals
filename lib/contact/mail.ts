export function contactInbox(configured: string | undefined) {
  const inbox = configured?.trim();
  return !inbox || inbox.toLowerCase() === "support@example.com" ? "kuyogbohol@gmail.com" : inbox;
}

type ContactMail = { to: string; subject: string; text: string; replyTo?: string; idempotencyKey: string };

type MailResult =
  | { accepted: true }
  | { accepted: false; reason: "missing_sender" | "network_error" | "rejected"; status?: number };

export async function sendContactEmail(message: ContactMail): Promise<MailResult> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from = process.env.EMAIL_FROM?.trim();
  if (!apiKey || !from) return { accepted: false, reason: "missing_sender" };

  const body = JSON.stringify({
    from,
    to: [message.to],
    subject: message.subject.replace(/[\r\n]+/g, " "),
    text: message.text,
    ...(message.replyTo ? { reply_to: message.replyTo } : {}),
  });
  for (let attempt = 0; attempt < 2; attempt++) {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json", "Idempotency-Key": message.idempotencyKey },
      body,
      cache: "no-store",
      signal: AbortSignal.timeout(4000),
    }).catch(() => null);
    if (response?.ok) return { accepted: true };

    const temporary = !response || response.status === 429 || response.status >= 500;
    const retryAfter = response?.headers.get("retry-after");
    const seconds = Number(retryAfter);
    const wait = retryAfter && Number.isFinite(seconds)
      ? Math.max(0, seconds * 1000)
      : retryAfter ? Math.max(0, Date.parse(retryAfter) - Date.now()) : 600;
    if (!temporary || attempt > 0 || wait > 2500) {
      return response ? { accepted: false, reason: "rejected", status: response.status } : { accepted: false, reason: "network_error" };
    }
    await new Promise(resolve => setTimeout(resolve, Number.isFinite(wait) ? wait : 600));
  }
  return { accepted: false, reason: "network_error" };
}
