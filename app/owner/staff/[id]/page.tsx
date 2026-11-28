import Link from "next/link";
import { notFound } from "next/navigation";
import { getOwnerContext } from "@/lib/owner-context";
import { ownerStaffFields, type OwnerStaffRow, type StaffHistory } from "@/lib/staff/context";
import { bookingIdPattern } from "@/lib/pickup/model";
import { StaffAccessActions } from "@/components/staff/owner-controls";
import { StaffChip, staffAction, staffCard } from "@/components/staff/shared";
import { StaffLoadError } from "@/components/staff/load-error";
import { paymentDate } from "@/lib/payment-format";

export const instant = false;

export default async function StaffDetailPage({ params }: PageProps<"/owner/staff/[id]">) {
  const { id } = await params;
  if (!bookingIdPattern.test(id)) notFound();
  const { owner, supabase } = await getOwnerContext();
  const [staff, history] = await Promise.all([
    supabase.from("owner_staff").select(ownerStaffFields).eq("owner_id",owner.id).eq("id",id).maybeSingle<OwnerStaffRow>(),
    supabase.rpc("owner_staff_history",{ p_staff:id }).overrideTypes<StaffHistory[], { merge: false }>(),
  ]);
  if (!staff.error && !staff.data) notFound();
  const row = staff.data;
  const events = Array.isArray(history.data) ? history.data : [];
  return <div className="mx-auto max-w-3xl space-y-4 font-body text-[#0F2342]">
    <Link data-page-parent href="/owner/staff" className={staffAction}>Back to handover staff</Link>
    {staff.error || !row ? <StaffLoadError message="Could not load this staff member." /> : <section className={`${staffCard} space-y-3`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0"><h1 className="break-words font-heading text-2xl font-bold">{row.display_name}</h1><p className="break-all text-[#5B6F89]">{row.email}</p></div>
        <StaffChip status={row.status} />
      </div>
      {row.status === "invited" && row.invite_expires_at && <p className="text-[#5B6F89]">Invitation expires {paymentDate(row.invite_expires_at)} Manila time.</p>}
      <StaffAccessActions row={row} />
    </section>}
    <section className={staffCard}>
      <h2 className="font-heading font-bold">Recent handovers</h2>
      {history.error ? <StaffLoadError message="Could not load recent handovers." /> : events.length
        ? <ol className="mt-2 divide-y divide-[#E3EEF9]">{events.map(event => <li key={`${event.reference}-${event.kind}-${event.created_at}`} className="space-y-1 py-3">
          <p className="break-words font-semibold">{event.reference} · {event.kind === "return_confirmed" ? "Return" : "Pickup"}</p>
          <p className="break-words">{event.vehicle_label} · {event.customer_name}</p>
          <time className="text-[#5B6F89]" dateTime={event.created_at}>{paymentDate(event.created_at)} Manila time</time>
        </li>)}</ol> : <p className="mt-2 text-[#5B6F89]">No handovers recorded yet.</p>}
    </section>
  </div>;
}
