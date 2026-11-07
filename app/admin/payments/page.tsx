import { AdminHeading } from "@/components/admin/ui";
import { OwnerPaymentReview } from "@/components/owner/payment-review";
import { getAdminContext } from "@/lib/admin-context";
export const instant = false;
export default async function AdminPaymentsPage() {
  const { supabase } = await getAdminContext();
  const [{ data: pending, error: pendingError }, { data, error }] = await Promise.all([
    supabase.from("payments").select("id,booking_id,amount,method,reference_no,proof_path,paid_at,booking:bookings(reference,total_price,start_date,car:cars!bookings_car_id_fkey(brand,model))").eq("status", "pending").order("paid_at"),
    supabase.from("payments").select("id,amount,method,status,reference_no,paid_at,booking:bookings(reference,status,owner:owners!bookings_owner_id_fkey(business_name),customer:profiles!bookings_customer_id_fkey(full_name))").order("paid_at", { ascending: false }).limit(200),
  ]);
  if (error || pendingError) {
    const describe = (failure: typeof error) => failure
      ? [failure.code, failure.message, failure.details, failure.hint].filter(Boolean).join(" | ")
      : "ok";
    console.error(`Could not load platform payment history: pending [${describe(pendingError)}]; history [${describe(error)}]`);
    throw new Error("Could not load platform payment history.");
  }
  return <><AdminHeading eyebrow="Payments" title="Booking deposits" description="Review slow deposit proofs and verification history."/><h2 className="mb-3 text-sm font-semibold">Pending verification</h2><OwnerPaymentReview payments={(pending ?? []) as never}/><h2 className="mb-3 mt-7 text-sm font-semibold">Recent payment activity</h2><div className="overflow-x-auto rounded-xl border bg-white"><table className="w-full min-w-[700px] text-left text-sm"><thead className="bg-slate-50 text-xs text-slate-500"><tr>{["Booking", "Owner", "Customer", "Amount", "Reference", "Status", "Submitted"].map(x => <th key={x} className="px-4 py-3">{x}</th>)}</tr></thead><tbody className="divide-y">{(data ?? []).map((p: any) => <tr key={p.id}><td className="px-4 py-3">{p.booking?.reference ?? "—"}</td><td className="px-4 py-3">{p.booking?.owner?.business_name ?? "—"}</td><td className="px-4 py-3">{p.booking?.customer?.full_name ?? "—"}</td><td className="px-4 py-3">₱{Number(p.amount).toLocaleString("en-PH")}</td><td className="px-4 py-3">{p.reference_no ?? "—"}</td><td className="px-4 py-3 capitalize">{p.status}</td><td className="px-4 py-3">{new Date(p.paid_at).toLocaleDateString("en-PH")}</td></tr>)}</tbody></table></div></>;
}
