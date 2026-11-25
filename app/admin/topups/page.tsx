import { AdminHeading } from "@/components/admin/ui";
import { AdminTopupReview, type Topup } from "@/components/admin/payment-admin";
import { getAdminContext } from "@/lib/admin-context";

export const instant = false;

export default async function AdminTopupsPage() {
  const { supabase } = await getAdminContext();
  const columns = "id,owner_id,amount,reference_no,proof_path,created_at,status,owner:owners(business_name)";
  const [pending, history] = await Promise.all([
    supabase.from("owner_credit_ledger").select(columns).eq("type", "topup").eq("status", "pending").order("created_at").returns<Topup[]>(),
    supabase.from("owner_credit_ledger").select(columns).eq("type", "topup").in("status", ["posted", "rejected"]).order("created_at", { ascending: false }).returns<Topup[]>(),
  ]);
  if (pending.error) throw new Error("Could not load top-up reviews.");

  return <>
    <AdminHeading eyebrow="Payments" title="Owner top-ups" description="Verify incoming platform payments before adding credits."/>
    <p className="mb-3 text-[13px] text-[#5B6F89] lg:hidden">Check the payment in your app first.</p>
    <AdminTopupReview rows={pending.data ?? []} history={history.data ?? []} historyAvailable={!history.error}/>
  </>;
}
