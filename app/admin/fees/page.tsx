import { AdminHeading, AdminStatus, adminMoney, mobileAction, mobileCard } from "@/components/admin/ui";
import { getAdminContext } from "@/lib/admin-context";
import { AdminInvoices } from "@/components/admin/admin-invoices";

export const instant = false;

export default async function AdminFeesPage() {
  const { supabase } = await getAdminContext();
  const [{ data: owners, error }, { data: invoices }, { data: balances }, { data: setting }] = await Promise.all([
    supabase.from("owners").select("id,business_name,fee_mode,commission_rate,is_active").order("business_name"),
    supabase.from("commission_invoices").select("id,owner_id,period_month,commission_due,status,due_date").order("period_month", { ascending: false }).limit(100),
    supabase.from("owner_credit_balances").select("owner_id,balance"),
    supabase.from("settings").select("value").eq("key", "credit_low_threshold").maybeSingle(),
  ]);
  if (error) throw new Error("Could not load owner fees and credits.");

  const balanceByOwner = new Map((balances ?? []).map(row => [row.owner_id, Number(row.balance)]));
  const threshold = Number(setting?.value ?? 200);
  const lowCredits = (owners ?? []).filter(owner => owner.fee_mode === "credits" && (balanceByOwner.get(owner.id) ?? 0) < threshold).length;
  const invoicesByOwner = Map.groupBy(invoices ?? [], row => row.owner_id);

  return <>
    <AdminHeading eyebrow="Finance" title="Fees and credits" description="Owner balances, fee modes, and invoice status."/>
    <div className="space-y-3 lg:hidden">
      <section aria-label="Finance summary" className="grid grid-cols-3 gap-2">
        {([["Credits held", adminMoney((balances ?? []).reduce((sum, row) => sum + Number(row.balance), 0))], ["Low credits", lowCredits], ["Unpaid invoices", invoices?.filter(row => row.status === "unpaid").length ?? 0]] as const).map(([label, value]) => <article key={label} className="min-w-0 rounded-xl border border-[#E3EEF9] bg-white p-2 text-[13px]"><p className="text-[#5B6F89]">{label}</p><p className="mt-1 font-semibold">{value}</p></article>)}
      </section>
      {owners?.map(owner => {
        const balance = balanceByOwner.get(owner.id) ?? 0;
        const low = owner.fee_mode === "credits" && balance < threshold;
        const unpaid = invoicesByOwner.get(owner.id)?.filter(row => row.status === "unpaid").length ?? 0;
        return <article key={owner.id} className={mobileCard}>
          <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="font-semibold">{owner.business_name}</h2><AdminStatus status={owner.fee_mode}/></div>
          <p className="mt-2">{Number(owner.commission_rate) * 100}% commission</p>
          <p className="mt-2 flex flex-wrap justify-between gap-2"><span>Credits</span><strong>{adminMoney(balance)}</strong></p>
          {owner.fee_mode === "credits" && threshold > 0 && <progress aria-label="Credits relative to the low balance threshold" value={Math.max(0, Math.min(balance, threshold))} max={threshold} className={`h-2 w-full ${low ? "accent-amber-600" : "accent-[#0A47B1]"}`}/>}
          <p className="mt-2 text-[#5B6F89]">{unpaid ? `${unpaid} unpaid invoices` : "No unpaid invoices shown"}</p>
          <div className="mt-3 flex flex-wrap gap-2"><a href="#monthly-invoices" className={mobileAction}>Invoices</a></div>
        </article>;
      })}
    </div>
    <div className="hidden overflow-x-auto rounded-xl border bg-white lg:block">
      <table className="w-full min-w-[620px] text-left text-sm">
        <thead className="bg-slate-50 text-xs text-slate-500"><tr><th className="p-4">Owner</th><th className="p-4">Fee mode</th><th className="p-4">Commission</th><th className="p-4">Credits</th><th className="p-4">Listings</th></tr></thead>
        <tbody className="divide-y">{(owners ?? []).map(o => <tr key={o.id}><td className="p-4">{o.business_name}</td><td className="p-4 capitalize">{o.fee_mode}</td><td className="p-4">{Number(o.commission_rate) * 100}%</td><td className="p-4">₱{Number(balanceByOwner.get(o.id) ?? 0).toLocaleString("en-PH")}</td><td className="p-4">{o.is_active ? "Active" : "Inactive"}</td></tr>)}</tbody>
      </table>
    </div>
    <h2 id="monthly-invoices" className="mb-3 mt-7 scroll-mt-20 font-semibold">Monthly invoices</h2>
    <AdminInvoices rows={invoices ?? []}/>
  </>;
}
