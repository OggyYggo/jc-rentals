import { AdminHeading } from "@/components/admin/ui";
import { AdminTopupReview, type Topup } from "@/components/admin/payment-admin";
import { getAdminContext } from "@/lib/admin-context";
import { AdminOnlineTopups, type OnlineTopupRow } from "@/components/admin/online-topups";
import { createAdminClient } from "@/lib/supabase/admin";

export const instant = false;

async function loadOnlineTopups() {
  const admin = createAdminClient();
  if (!admin) return null;

  return await admin.from("gateway_topups")
    .select("order_id,owner_id,amount,method,status,needs_review,provider,livemode,created_at,owner:owners(business_name)")
    .order("created_at", { ascending: false }).returns<OnlineTopupRow[]>();
}

export default async function AdminTopupsPage() {
  const { supabase } = await getAdminContext();
  const columns = "id,owner_id,amount,reference_no,proof_path,created_at,status,owner:owners(business_name)";
  const [pending, history, onlineTopups] = await Promise.all([
    supabase.from("owner_credit_ledger").select(columns).eq("type", "topup").eq("status", "pending").order("created_at").returns<Topup[]>(),
    supabase.from("owner_credit_ledger").select(columns).eq("type", "topup").in("status", ["posted", "rejected"]).order("created_at", { ascending: false }).returns<Topup[]>(),
    loadOnlineTopups(),
  ]);
  if (pending.error) throw new Error("Could not load top-up reviews.");

  return <>
    <AdminHeading eyebrow="Payments" title="Owner top-ups" description="Verify incoming platform payments before adding credits."/>
    <p className="mb-3 text-[13px] text-[#5B6F89] lg:hidden">Check the payment in your app first.</p>
    <AdminTopupReview rows={pending.data ?? []} history={history.data ?? []} historyAvailable={!history.error}/>
    <AdminOnlineTopups rows={onlineTopups?.data ?? []} available={Boolean(onlineTopups && !onlineTopups.error)} />
  </>;
}
