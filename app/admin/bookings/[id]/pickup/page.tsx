import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminHeading } from "@/components/admin/ui";
import { PickupAdminControls } from "@/components/pickup/PickupAdminControls";
import { getAdminContext } from "@/lib/admin-context";
import { bookingIdPattern } from "@/lib/pickup/model";
import { pickupOrigins } from "@/lib/pickup/origin";
import { paymentDate, paymentPeso } from "@/lib/payment-format";

export const instant = false;
type Event = {
  id: number; kind: string; created_at: string; actor: { full_name: string } | null;
  detail: { method?: string; balance_amount?: number; id_checked?: boolean; reason?: string; notes?: string; actor_role?: string; staff_name?: string; owner_business?: string };
};

export default async function AdminPickupPage({ params }: { params: Promise<{ id: string }> }) {
  const { supabase } = await getAdminContext();
  const { id } = await params;
  if (!bookingIdPattern.test(id)) notFound();
  const [booking, pass, events, origins] = await Promise.all([
    supabase.from("bookings").select("reference,status").eq("id",id).maybeSingle(),
    supabase.from("booking_pickup_passes").select("status,rotations,used_at").eq("booking_id",id).maybeSingle(),
    supabase.from("booking_pickup_events").select("id,kind,detail,created_at,actor:profiles!booking_pickup_events_actor_id_fkey(full_name)").eq("booking_id",id)
      .order("created_at",{ ascending: false }).order("id",{ ascending: false }).returns<Event[]>(),
    pickupOrigins(),
  ]);
  if (booking.error || pass.error || events.error) throw new Error("Could not load pickup activity.");
  if (!booking.data) notFound();

  return <div className="max-w-2xl space-y-4">
    <Link href={`/admin/bookings?reference=${encodeURIComponent(booking.data.reference)}`} className="text-sm font-semibold text-blue-800">← Booking list</Link>
    <AdminHeading title="Pickup activity" description={booking.data.reference} />
    <p className="rounded-lg border bg-white p-3 text-sm">Pass state · <span className="font-semibold capitalize">{pass.data?.status ?? "Not issued"}</span></p>
    <PickupAdminControls id={id} canReset={booking.data.status === "confirmed"} origins={origins} />
    <section className="rounded-xl border bg-white p-4">
      <h2 className="font-semibold">Pickup history</h2>
      {events.data?.length ? <ol className="mt-2 divide-y">
        {events.data.map(event => <li key={event.id} className="space-y-1 py-3 text-sm">
          <p className="font-semibold capitalize">{event.kind.replaceAll("_"," ")}</p>
          <p className="break-words">{paymentDate(event.created_at)} Manila time · {event.detail.actor_role === "staff"
            ? `${event.detail.staff_name ?? "Staff"} (staff) · ${event.detail.owner_business ?? "Rental business"}`
            : event.actor?.full_name || "System or previous user"}</p>
          {event.detail.method && <p>Balance received · {paymentPeso(event.detail.balance_amount ?? 0)} · {event.detail.method.replaceAll("_"," ")}</p>}
          {event.detail.id_checked && <p>ID checked</p>}
          {event.detail.reason && <p className="whitespace-pre-wrap break-words">Reason · {event.detail.reason}</p>}
          {event.detail.notes && <p className="whitespace-pre-wrap break-words">Return notes · {event.detail.notes}</p>}
        </li>)}
      </ol> : <p className="mt-2 text-sm text-slate-600">No pickup activity yet.</p>}
    </section>
  </div>;
}
