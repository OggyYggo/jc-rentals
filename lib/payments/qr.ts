import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import type { PaymentOption } from "./providers";

export async function signPaymentQr(option: Pick<PaymentOption, "qr_bucket" | "qr_path">, client = createAdminClient()) {
  const signed = await client?.storage.from(option.qr_bucket).createSignedUrl(option.qr_path, 300);
  return signed?.data?.signedUrl ?? null;
}

export async function bookingPaymentOptions(db: SupabaseClient, bookingId: string) {
  const { data, error } = await db.rpc("get_booking_payment_options", { p_booking_id: bookingId });
  return { data: Array.isArray(data) ? (data as PaymentOption[]) : null, error };
}

export function ownerPaymentOptions(db: SupabaseClient, ownerId: string) {
  return db.from("owner_payment_options")
    .select("id,provider,label,account_name,account_hint,is_preferred,sort_order,qr_path,qr_bucket,verified,rejection_reason,updated_at")
    .eq("owner_id", ownerId).eq("is_active", true).order("sort_order").order("id");
}
