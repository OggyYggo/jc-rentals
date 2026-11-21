import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = await createClient();
  const admin = createAdminClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) return new Response(null, { status: 401 });
  if (!admin) return new Response(null, { status: 503 });
  const { data: booking } = await db.from("bookings").select("owner_id,payment_due_at,payment_resubmit_due_at").eq("id", id).eq("customer_id", user.id)
    .eq("status", "awaiting_payment").maybeSingle();
  if (!booking) return new Response(null, { status: 404 });
  const deadline = Math.max(Date.parse(booking.payment_due_at ?? "1970-01-01"), Date.parse(booking.payment_resubmit_due_at ?? "1970-01-01"));
  if (deadline <= Date.now()) return new Response(null, { status: 404 });
  const { data: owner } = await admin.from("owners").select("payment_qr_path").eq("id", booking.owner_id).eq("payment_qr_verified", true).maybeSingle();
  if (!owner?.payment_qr_path) return new Response(null, { status: 404 });
  const { data } = await admin.storage.from("owner-qr").download(owner.payment_qr_path);
  if (!data || !["image/png", "image/jpeg", "image/webp"].includes(data.type)) return new Response(null, { status: 404 });
  return new Response(data, { headers: {
    "Content-Type": data.type, "Content-Disposition": `attachment; filename="booking-payment-qr.${data.type.split("/")[1]}"`,
    "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff",
  } });
}
