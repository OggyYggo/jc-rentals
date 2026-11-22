"use server";

import { createHmac } from "node:crypto";
import { headers } from "next/headers";
import { contactInbox, sendContactEmail } from "@/lib/contact/mail";
import { contactSchema, contactTopicLabels } from "@/lib/contact/schema";
import type { ContactActionState } from "@/lib/contact/types";
import { createAdminClient } from "@/lib/supabase/admin";
import { queueSubmissionAlert } from "@/lib/admin-alerts/delivery";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/shared";

function stringField(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

async function verifyTurnstile(token: string, ip: string): Promise<boolean> {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret || !token) return false;

  const body = new URLSearchParams({ secret, response: token });
  if (ip !== "unknown") body.set("remoteip", ip);
  const response = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
    method: "POST",
    body,
    cache: "no-store",
  }).catch(() => null);
  if (!response?.ok) return false;
  const result = await response.json().catch(() => null) as { success?: boolean } | null;
  return result?.success === true;
}

export async function submitContactMessage(
  _previousState: ContactActionState,
  formData: FormData,
): Promise<ContactActionState> {
  if (stringField(formData, "website").trim()) {
    return { ok: true, firstName: "there", email: "" };
  }

  const parsed = contactSchema.safeParse({
    full_name: stringField(formData, "full_name"),
    email: stringField(formData, "email"),
    mobile: stringField(formData, "mobile"),
    topic: stringField(formData, "topic"),
    booking_ref: stringField(formData, "booking_ref"),
    message: stringField(formData, "message"),
  });
  if (!parsed.success) {
    return { ok: false, fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]> };
  }

  const captchaToken = stringField(formData, "captchaToken");
  if (!captchaToken) return { ok: false, error: "Please complete the check and try again." };

  if (!isSupabaseConfigured()) {
    return { ok: false, error: "We could not send your message. Please try again." };
  }

  const requestHeaders = await headers();
  const forwardedIp = requestHeaders.get("x-real-ip")
    ?? requestHeaders.get("x-forwarded-for")?.split(",")[0]?.trim()
    ?? "unknown";
  const ip = forwardedIp.length > 0 && forwardedIp.length <= 128 ? forwardedIp : "unknown";
  if (!(await verifyTurnstile(captchaToken, ip))) {
    return { ok: false, error: "Please complete the check and try again." };
  }

  const admin = createAdminClient();
  const hashSecret = process.env.SUPABASE_SECRET_KEY;
  if (!admin || !hashSecret) {
    return { ok: false, error: "We could not send your message. Please try again." };
  }

  const ipHash = createHmac("sha256", hashSecret).update(ip).digest("hex");
  const emailHash = createHmac("sha256", hashSecret).update(parsed.data.email).digest("hex");
  const { data: allowed, error: rateLimitError } = await admin.rpc("consume_contact_rate_limit", {
    p_ip_hash: ipHash,
    p_email_hash: emailHash,
  });
  if (rateLimitError) {
    console.error("Contact rate limit check failed", rateLimitError.code);
    return { ok: false, error: "We could not send your message. Please try again." };
  }
  if (!allowed) return { ok: false, error: "Too many messages. Please try again in a few minutes." };

  let userId: string | null = null;
  try {
    const authClient = await createClient();
    const { data: { user } } = await authClient.auth.getUser();
    userId = user?.id ?? null;
  } catch {
    // A public contact message can still be sent when optional session lookup fails.
  }

  const { data: row, error: insertError } = await admin.from("contact_messages").insert({
    user_id: userId,
    full_name: parsed.data.full_name,
    email: parsed.data.email,
    mobile: parsed.data.mobile,
    topic: parsed.data.topic,
    booking_ref: parsed.data.booking_ref ?? null,
    message: parsed.data.message,
    ip_hash: ipHash,
  }).select("id").single();

  if (insertError || !row) {
    console.error("Contact message insert failed", insertError?.code ?? "missing row");
    return { ok: false, error: "We could not send your message. Please try again." };
  }

  const supportInbox = contactSchema.shape.email.safeParse(contactInbox(process.env.CONTACT_INBOX_EMAIL));
  const topicLabel = contactTopicLabels[parsed.data.topic];
  const firstName = parsed.data.full_name.split(" ")[0];
  const alertQueued = queueSubmissionAlert(admin, "contact.message", row.id);

  // Send the support copy first so a visitor receipt cannot take its place during provider throttling.
  const support = supportInbox.success
    ? await sendContactEmail({
        to: supportInbox.data,
        replyTo: parsed.data.email,
        subject: `[Contact] ${topicLabel} — ${parsed.data.full_name}`,
        text: [
          `Name: ${parsed.data.full_name}`,
          `Email: ${parsed.data.email}`,
          `Mobile: ${parsed.data.mobile ?? "Not provided"}`,
          `Topic: ${topicLabel}`,
          `Booking reference: ${parsed.data.booking_ref ?? "Not provided"}`,
          "",
          "Message:",
          parsed.data.message,
        ].join("\n"),
        idempotencyKey: `contact/${row.id}/support`,
      })
    : { accepted: false as const, reason: "invalid_inbox" };
  const visitor = await sendContactEmail({
    to: parsed.data.email,
    subject: "We received your message",
    text: [
      `Hi ${firstName},`,
      "",
      "Thanks for contacting Kuyog Bohol. We will reply by email as soon as we can.",
      "",
      "A copy of your message:",
      parsed.data.message,
    ].join("\n"),
    idempotencyKey: `contact/${row.id}/visitor`,
  });

  const emailStatus = support.accepted && visitor.accepted ? "sent"
    : support.accepted || visitor.accepted ? "partial" : "failed";
  if (!support.accepted) console.error("Contact support email not accepted", { contactId: row.id, ...support });
  if (!visitor.accepted) console.error("Contact visitor email not accepted", { contactId: row.id, ...visitor });
  const { error: statusError } = await admin.from("contact_messages").update({ email_status: emailStatus }).eq("id", row.id);
  if (statusError) console.error("Contact email status update failed", statusError.code);
  await alertQueued;

  return {
    ok: true,
    firstName,
    email: parsed.data.email,
  };
}
