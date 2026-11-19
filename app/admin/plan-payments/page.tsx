import { AdminHeading } from "@/components/admin/ui";
import { PlanPaymentReview, type PlanPaymentRow } from "@/components/admin/plan-payment-review";
import { getAdminContext } from "@/lib/admin-context";

export const instant = false;

export default async function AdminPlanPaymentsPage() {
  const { supabase } = await getAdminContext();
  const { data: payments, error } = await supabase.from("plan_payments").select("id,owner_id,plan_id,amount,reference_no,proof_path,status,months,reject_reason,created_at").order("created_at", { ascending: false });
  if (error) throw new Error("Could not load plan payment requests.");
  const ownerIds = [...new Set((payments ?? []).map((payment) => payment.owner_id))];
  const planIds = [...new Set((payments ?? []).map((payment) => payment.plan_id))];
  const [{ data: owners }, { data: plans }] = await Promise.all([
    ownerIds.length ? supabase.from("owners").select("id,business_name").in("id", ownerIds) : Promise.resolve({ data: [] }),
    planIds.length ? supabase.from("plans").select("id,name").in("id", planIds) : Promise.resolve({ data: [] }),
  ]);
  const rows = await Promise.all((payments ?? []).map(async (payment) => {
    const { data: proof } = payment.proof_path ? await supabase.storage.from("owner-plan-proofs").createSignedUrl(payment.proof_path, 300) : { data: null };
    return { ...payment, owner_name: owners?.find((owner) => owner.id === payment.owner_id)?.business_name ?? "Owner", plan_name: plans?.find((plan) => plan.id === payment.plan_id)?.name ?? "Plan", proof_url: proof?.signedUrl ?? null };
  }));
  return <><AdminHeading eyebrow="Subscriptions" title="Plan payments" description="Review QR payments and activate or reject owner plan requests."/><PlanPaymentReview rows={rows as PlanPaymentRow[]}/></>;
}
