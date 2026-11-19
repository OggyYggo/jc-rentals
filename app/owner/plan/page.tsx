import Link from "next/link";
import { getOwnerContext } from "@/lib/owner-context";
import { peso } from "@/lib/plans/breakEven";
import { createAdminClient } from "@/lib/supabase/admin";
import { PayPlanDrawer } from "@/components/owner/PayPlanDrawer";

export const instant = false;

export default async function OwnerPlanPage({ searchParams }: PageProps<"/owner/plan">) {
  const { owner, supabase } = await getOwnerContext();
  const params = await searchParams;
  const admin = createAdminClient();
  const [{ data: effective }, { data: usage }, { data: plans }, { data: assignment }, { data: payments }, { data: settings }] = await Promise.all([
    supabase.rpc("owner_effective_plan", { p_owner: owner.id }),
    supabase.rpc("owner_car_usage", { p_owner: owner.id }),
    supabase.from("plans").select("id,code,name,tagline,price_php,max_active_vehicles,commission_rate,support_level,features,is_featured").eq("is_public", true).eq("is_active", true).order("sort_order"),
    supabase.from("owner_plans").select("expires_at,status").eq("owner_id", owner.id).maybeSingle(),
    supabase.from("plan_payments").select("id,plan_id,amount,reference_no,status,months,reject_reason,proof_path,created_at").eq("owner_id", owner.id).order("created_at", { ascending: false }),
    admin ? admin.from("settings").select("key,value").in("key", ["platform_payment_qr_path","platform_payment_account_name","platform_qr_path","platform_account_name"]) : Promise.resolve({ data: [] }),
  ]);
  const plan = Array.isArray(effective) ? effective[0] : null;
  const chosenPlan = (plans ?? []).find((item) => item.code === params.choose);
  const carUsage = Array.isArray(usage) ? usage[0] : null;
  const expiry = assignment?.expires_at ? new Date(assignment.expires_at) : null;
  const support: Record<string,string> = { email: "Email support", priority: "Priority email support", priority_onboarding: "Priority support and onboarding help" };
  const settingMap = new Map((settings ?? []).map((row) => [row.key, row.value]));
  const qrPath = String(settingMap.get("platform_payment_qr_path") ?? settingMap.get("platform_qr_path") ?? "").replace(/^null$|^""$/, "");
  const accountName = String(settingMap.get("platform_payment_account_name") ?? "") || String(settingMap.get("platform_account_name") ?? "");
  const { data: signedQr } = admin && qrPath ? await admin.storage.from("platform-qr").createSignedUrl(qrPath, 300) : { data: null };
  const paymentRows = payments ?? [];
  const pendingPayment = paymentRows.some((payment) => payment.status === "pending");
  return <main className="mx-auto max-w-5xl space-y-6 px-4 py-6 sm:px-7">
    <header><p className="text-[10px] font-semibold uppercase tracking-[.15em] text-[#4f6fc5]">Owner account</p><h1 className="mt-1 text-2xl font-semibold text-[#293a52]">Plans and pricing</h1><p className="mt-2 text-sm text-[#78869a]">Manage your active listing allowance and see available plans.</p></header>
    <section className="rounded-xl border border-[#e4eaf2] bg-white p-5 shadow-sm"><div className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-xs text-[#8190a3]">Current plan</p><h2 className="mt-1 text-xl font-semibold text-[#293a52]">{plan?.plan_code ? String(plan.plan_code).replace(/^./, (x:string)=>x.toUpperCase()) : "Starter"}</h2><p className="mt-1 text-sm text-[#697991]">{Number(plan?.commission ?? owner.commission_rate) * 100}% commission · {expiry ? `Expires ${expiry.toLocaleDateString("en-PH")}` : "No expiry"}</p></div><p className="rounded-lg bg-[#f2f6fd] px-4 py-2 text-sm font-semibold text-[#385885]">{carUsage?.used ?? 0} of {carUsage?.max_cars ?? 0} active vehicles</p></div>
      <div className="mt-4 h-2 overflow-hidden rounded-full bg-[#edf1f6]" role="meter" aria-label="Active car usage" aria-valuemin={0} aria-valuemax={carUsage?.max_cars ?? 1} aria-valuenow={carUsage?.used ?? 0}><div className="h-full rounded-full bg-[#3676d2]" style={{width:`${Math.min(100, (Number(carUsage?.used ?? 0)/Math.max(1,Number(carUsage?.max_cars ?? 1)))*100)}%`}}/></div>
      {expiry && <p className="mt-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">Your plan expires on {expiry.toLocaleDateString("en-PH")}. Contact us to renew and keep your vehicles online.</p>}
    </section>
    <section><div className="mb-3 flex items-end justify-between"><div><h2 className="text-lg font-semibold text-[#293a52]">Available plans</h2><p className="mt-1 text-xs text-[#8491a3]">Plan changes are confirmed by our team after payment review.</p></div><Link href="/pricing" className="text-xs font-semibold text-[#315fae] hover:underline">Full pricing details</Link></div>
      {chosenPlan && chosenPlan.code !== plan?.plan_code && <aside className="mb-4 rounded-xl border border-[#bcd4f5] bg-[#f3f8ff] p-4"><p className="text-sm font-semibold text-[#244b80]">{chosenPlan.name} selected</p><p className="mt-1 text-xs leading-5 text-[#60758f]">This is the plan you chose on your application. It activates after payment review.</p></aside>}
      {chosenPlan && Number(chosenPlan.price_php) > 0 && chosenPlan.code !== plan?.plan_code && <div className="mb-5"><PayPlanDrawer plan={{id:chosenPlan.id,code:chosenPlan.code,name:chosenPlan.name,price_php:Number(chosenPlan.price_php)}} qrUrl={signedQr?.signedUrl ?? null} accountName={accountName} pending={pendingPayment}/></div>}
      <div className="grid gap-4 sm:grid-cols-3">{(plans ?? []).map((item) => { const features=Array.isArray(item.features)?item.features as string[]:[]; const current=plan?.plan_code===item.code; const selected=chosenPlan?.code===item.code; return <article key={item.id} className={`rounded-xl border bg-white p-5 ${current||selected?"border-[#4c78d0] ring-1 ring-[#4c78d0]":"border-[#e4eaf2]"}`}><div className="flex justify-between gap-2"><h3 className="font-semibold text-[#34455e]">{item.name}</h3>{current?<span className="text-[10px] font-semibold text-[#315fae]">YOUR PLAN</span>:selected&&<span className="text-[10px] font-semibold text-[#315fae]">SELECTED</span>}</div><p className="mt-2 text-xl font-bold text-[#293a52]">{Number(item.price_php)===0?"Free":`${peso(Number(item.price_php))}/month`}</p><p className="mt-2 text-xs text-[#687992]">{Number(item.commission_rate)*100}% commission · up to {item.max_active_vehicles} active vehicles</p><p className="mt-1 text-xs text-[#687992]">{support[item.support_level]??item.support_level}</p><ul className="mt-4 space-y-2 border-t border-[#edf0f4] pt-4">{features.map((feature)=><li key={feature} className="text-xs leading-5 text-[#6d7c90]">• {feature}</li>)}</ul>{!current&&<Link href="/contact?topic=owner" className="mt-5 flex h-10 items-center justify-center rounded-lg bg-[#2457d6] text-xs font-semibold text-white">Ask about this plan</Link>}</article>})}</div>
    </section>
    {paymentRows.length > 0 && <section className="rounded-xl border border-[#e4eaf2] bg-white p-5"><h2 className="text-lg font-semibold text-[#293a52]">Plan payment history</h2><div className="mt-4 divide-y divide-[#edf0f4]">{paymentRows.map((payment) => { const name=(plans ?? []).find((item)=>item.id===payment.plan_id)?.name ?? "Plan"; return <article key={payment.id} className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm"><div><p className="font-semibold text-[#40536d]">{name} · {payment.months} month{payment.months===1?"":"s"} · {peso(Number(payment.amount))}</p><p className="mt-1 text-xs text-[#78869a]">Reference {payment.reference_no} · {new Date(payment.created_at).toLocaleDateString("en-PH")}</p>{payment.reject_reason && <p className="mt-1 text-xs text-red-700">Reason: {payment.reject_reason}</p>}</div><span className={`rounded-full px-3 py-1 text-xs font-semibold ${payment.status==="verified"?"bg-green-50 text-green-800":payment.status==="rejected"?"bg-red-50 text-red-800":"bg-amber-50 text-amber-800"}`}>{payment.status}</span></article>})}</div></section>}
  </main>;
}
