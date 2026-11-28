"use server";

import { headers } from "next/headers";
import { userAgent } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { PaymentImageErrorCode } from "@/lib/payment-image";

export async function logPaymentImageFailure(code: PaymentImageErrorCode, mime: string, size: number) {
  if (!["IMAGE_TYPE", "IMAGE_TOO_LARGE", "IMAGE_UNREADABLE"].includes(code) ||
      !Number.isSafeInteger(size) || size < 0) return;
  const { data: { user } } = await (await createClient()).auth.getUser();
  if (!user) return;
  const browser = userAgent({ headers: await headers() }).browser.name ?? "Unknown";
  const mimeTypes = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif", "image/gif", "image/avif", "application/pdf", "application/octet-stream", "text/plain"];
  console.warn("Payment image processing failed", { code, type: mimeTypes.includes(mime) ? mime : mime === "" ? "" : "other", size, browser });
}
