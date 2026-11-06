import { PageHeading } from "@/components/owner/ui";
import { OwnerPaymentReview } from "@/components/owner/payment-review";
import { getOwnerContext } from "@/lib/owner-context";

export const instant = false;
export default async function OwnerPaymentsPage() {
  const { supabase, owner } = await getOwnerContext();
  const { data, error } = await supabase.from("payments").select("id, booking_id, amount, method, reference_no, proof_path, created_at, booking:bookings(reference, total_price, start_date, car:cars(brand, model))").eq("status", "pending").order("created_at");
  if (error) throw new Error("Could not load payment review queue.");
  return <><PageHeading eyebrow="Payments" title="Deposit verification" description="Check each transfer in your own GCash or bank history before confirming it."/><OwnerPaymentReview payments={(data ?? []) as never}/></>;
}
