import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { PaymentProofForm } from "@/components/customer/payment-proof-form";

export const instant = false;

export default async function BookingPayPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: booking } = await supabase.from("bookings").select("id, reference, customer_id, owner_id, status, payment_due_at, amount_due_now, balance_at_pickup, total_price").eq("id", id).eq("customer_id", user.id).maybeSingle();
  if (!booking) notFound();
  if (!["awaiting_payment", "payment_review"].includes(booking.status)) redirect("/account/bookings");
  const admin = createAdminClient();
  const { data: owner } = admin ? await admin.from("owners").select("business_name, payment_method_label, payment_account_name, payment_qr_path").eq("id", booking.owner_id).maybeSingle() : { data: null };
  let qrUrl: string | null = null;
  if (owner?.payment_qr_path) {
    if (admin) {
      const { data } = await admin.storage.from("owner-qr").createSignedUrl(owner.payment_qr_path, 60);
      qrUrl = data?.signedUrl ?? null;
    }
  }
  return <main className="mx-auto max-w-2xl px-4 py-10"><a href="/account/bookings" className="text-sm text-blue-700">← My bookings</a><h1 className="mt-5 text-2xl font-semibold text-slate-900">Pay your booking deposit</h1><p className="mt-2 text-sm text-slate-600">Booking {booking.reference} · {owner?.business_name ?? "Rental owner"}</p><section className="mt-6 rounded-2xl border bg-white p-6 shadow-sm"><p className="text-sm text-slate-500">Pay exactly</p><p className="mt-1 text-3xl font-bold text-slate-900">₱{Number(booking.amount_due_now).toLocaleString("en-PH", { minimumFractionDigits: 2 })}</p><p className="mt-2 text-sm text-slate-600">Balance at pickup: ₱{Number(booking.balance_at_pickup).toLocaleString("en-PH", { minimumFractionDigits: 2 })}</p><div className="mt-5 rounded-xl bg-blue-50 p-4 text-sm text-blue-950"><p><b>Pay to:</b> {owner?.payment_method_label || "Payment QR"}</p><p><b>Account name:</b> {owner?.payment_account_name || "Not provided"}</p>{qrUrl ? <img src={qrUrl} alt="Owner payment QR" className="mt-4 max-h-64 rounded-lg bg-white object-contain p-2"/> : <p className="mt-3 text-red-700">Payment QR is not available. Please contact support.</p>}</div><p className="mt-4 text-xs leading-5 text-slate-500">This payment goes directly to the car owner. Kuyog Bohol does not receive it. Add booking reference <b>{booking.reference}</b> to your transfer note. Payment deadline: {booking.payment_due_at ? new Date(booking.payment_due_at).toLocaleString("en-PH") : "24 hours after booking"}.</p>{booking.status === "payment_review" ? <p className="mt-5 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">Your proof is awaiting owner verification.</p> : <PaymentProofForm bookingId={booking.id} customerId={user.id} amount={Number(booking.amount_due_now)}/>}</section></main>;
}
