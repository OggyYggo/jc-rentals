import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";
import { PickupQr } from "@/components/pickup/PickupQr";
import { PickupPassActions } from "@/components/pickup/PickupPassActions";
import { CopyButton } from "@/components/ui/CopyButton";
import { BookingStepper } from "@/components/customer/booking-progress";
import { createClient } from "@/lib/supabase/server";
import { bookingIdPattern, type PickupPass } from "@/lib/pickup/model";
import { pickupOrigin } from "@/lib/pickup/origin";
import { paymentDate, paymentPeso } from "@/lib/payment-format";

export const instant = false;
export const metadata = { title: "Pickup pass", robots: { index: false, follow: false } };

export default async function PickupPage({ params }: { params: Promise<{ id: string }> }) {
  await connection();
  const { id } = await params;
  if (!bookingIdPattern.test(id)) notFound();
  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(`/account/bookings/${id}/pickup`)}`);
  const { data, error } = await db.rpc("get_my_pickup_pass", { p_booking: id });
  if (error) throw new Error("Could not load the pickup pass.");
  if (!data) notFound();
  const pass = data as PickupPass;
  const origin = pass.token ? await pickupOrigin().catch(() => null) : null;
  const ready = pass.state === "ready" || pass.state === "today";

  return <main className="mx-auto w-full max-w-md px-4 py-6">
    <Link className="inline-flex min-h-11 items-center text-sm font-semibold text-blue-800" href={`/account/bookings#trip-${id}`}>← My bookings</Link>
    <h1 className="mt-2 text-2xl font-bold text-slate-900">Pickup pass</h1>
    <BookingStepper status={ready ? "confirmed" : ["used", "return_ready"].includes(pass.state) ? "picked_up" : ""} />
    <div className="flex flex-col md:contents">
    <div className="max-md:order-last md:contents"><PickupPassActions bookingId={id} state={pass.state} rotations={pass.rotations} /></div>
    {pass.state === "return_ready" ? <section className="mt-3 rounded-[22px] border-2 border-[#D6E6F7] bg-white p-4 text-slate-900">
      <h2 className="text-center font-semibold text-[#0A3D91]">Return pass</h2>
      {origin && pass.token && <PickupQr url={`${origin}/p/${pass.token}`} />}
      <p className="text-center text-sm">{origin ? "Show this QR to the owner when you return the vehicle." : "Ask the owner to record the return from their booking."}</p>
    </section> : ready ? <section className="mt-2 rounded-[22px] border-2 border-[#D6E6F7] bg-white p-3.5 text-[#0F2342]">
      <p className="mx-auto w-fit rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-900 max-md:bg-[#E3F7EA] max-md:text-[#12703A]"><span className="md:hidden">Valid for pickup</span><span className="hidden md:inline">{pass.state === "today" ? "Pickup today" : "Ready for pickup"}</span></p>
      {origin && pass.token ? <PickupQr mobileCompact url={`${origin}/p/${pass.token}`} />
        : <p className="mt-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-950">The QR is unavailable. Show the backup code to the owner.</p>}
      <div className="text-center">
        <p className="text-xs font-semibold text-slate-600">Backup code</p>
        <p className="text-[38px] font-bold tracking-[.14em] text-[#0A3D91] tabular-nums">{pass.backup_code?.replace(/(.{3})/, "$1 ")}</p>
      </div>
      <div className="mt-3 space-y-2 border-t border-blue-100 pt-3 text-sm">
        <div className="flex flex-wrap items-center justify-between gap-2"><span className="break-all font-semibold">{pass.reference}</span><CopyButton mobileTouch value={pass.reference} label="Copy reference" /></div>
        <p className="font-semibold">{pass.vehicle_label} · {pass.mode === "self_drive" ? "Self-drive" : "With driver"}</p>
        <p>{pass.start_date} to {pass.end_date}{pass.pickup_time && ` · Pickup ${pass.pickup_time.slice(0, 5)} Manila time`}</p>
        <p>Pass valid {pass.valid_from} to {pass.valid_until} (Manila time)</p>
        <p>Balance at pickup · <strong>{paymentPeso(pass.balance_at_pickup)}</strong></p>
        {pass.mode === "self_drive" && pass.deposit_amount > 0 && <p>Refundable safety deposit · {paymentPeso(pass.deposit_amount)}</p>}
      </div>
      <p className="mt-3 hidden text-sm md:block">Show this to the owner. Bring your driver’s license and government ID.</p>
      {origin && pass.token && <a href={`/account/bookings/${id}/pickup/image`} className="mt-3 inline-flex min-h-11 w-full items-center justify-center rounded-lg bg-[#0A3D91] px-3 text-sm font-semibold text-white max-md:h-[52px] max-md:rounded-full">Save as image</a>}
      <p className="mt-2 text-center text-xs text-slate-600">Increase your screen brightness when scanning.</p>
    </section> : <section className="mt-4 space-y-3 rounded-xl border bg-white p-4 text-sm">
      {pass.state === "used" ? <p>{pass.used_at ? `Picked up on ${paymentDate(pass.used_at)} Manila time` : "Pickup completed."}</p>
        : pass.state === "not_ready" ? <><p>Your pickup pass appears after the owner confirms your payment.</p><Link className="font-semibold text-blue-800 underline" href={`/account/bookings/${id}/pay`}>View payment</Link></>
        : <p>{pass.state === "expired" ? "This pickup pass has expired." : "This pickup pass has been cancelled."}</p>}
    </section>}
    {ready && <section className="mt-4 rounded-2xl border border-[#D6E6F7] bg-white p-4 text-sm text-[#0F2342] md:hidden">
      <h2 className="font-heading font-semibold">At pickup</h2>
      <ol className="mt-2 list-decimal space-y-1 pl-5 text-[#5B6F89]">
        <li>Show the QR or backup code so the owner can scan or enter it.</li>
        <li>Show your government ID{pass.mode === "self_drive" && " and driver’s license"}.</li>
        <li>Pay any remaining balance{pass.mode === "self_drive" && pass.deposit_amount > 0 && " and the refundable safety deposit"}.</li>
        <li>The owner marks the vehicle as picked up.</li>
      </ol>
    </section>}
    </div>
  </main>;
}
