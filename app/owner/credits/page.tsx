import { CreditBanner, type CreditState } from "@/components/owner/credit-state";
import { PageHeading } from "@/components/owner/ui";
import { getOwnerContext } from "@/lib/owner-context";
import { paymentPeso } from "@/lib/payment-format";
import { OwnerCredits } from "@/components/owner/credits";
import { OnlineTopup, OnlineTopupStatus } from "@/components/owner/online-topup";
import { expireGatewayTopups, maximumTopup, minimumTopup, orderPattern, quickpayConfig } from "@/lib/payments/quickpay";
import { after } from "next/server";

export const instant = false;

async function loadOnlineTopup(supabase: Awaited<ReturnType<typeof getOwnerContext>>["supabase"], ownerId: string, value: unknown) {
  if (typeof value !== "string" || !orderPattern.test(value)) return null;
  const { data } = await supabase.from("gateway_topups").select("order_id,status,ledger_id")
    .eq("owner_id", ownerId).eq("provider", "quickpay").eq("order_id", value).maybeSingle();
  if (!data) return null;
  return { orderId: data.order_id, status: data.ledger_id ? "paid" : data.status };
}

export default async function OwnerCreditsPage({ searchParams }: PageProps<"/owner/credits">) {
  const { supabase, owner } = await getOwnerContext();
  const config = quickpayConfig();
  if (config) after(() => expireGatewayTopups(config, owner.id));
  const onlineTopup = config ? await loadOnlineTopup(supabase, owner.id, (await searchParams).topup) : null;
  const [ledger, creditState, settings, invoices] = await Promise.all([
    supabase.from("owner_credit_ledger").select("id,type,amount,status,reference_no,proof_path,note,created_at")
      .eq("owner_id", owner.id).order("created_at", { ascending: false }),
    supabase.rpc("owner_credit_state", { p_owner_id: owner.id }).maybeSingle<CreditState>(),
    supabase.from("owner_payment_settings").select("key,value").in("key", ["platform_account_name", "platform_qr_path", "min_credit_to_list"]),
    supabase.from("commission_invoices").select("id,period_month,commission_due,due_date,status")
      .eq("owner_id", owner.id).order("period_month", { ascending: false }),
  ]);
  if (ledger.error || creditState.error || settings.error || invoices.error) throw new Error("Could not load credits and invoices.");
  const values = new Map((settings.data ?? []).map(row => [row.key, row.value]));
  const path = String(values.get("platform_qr_path") ?? "");
  const qrUrl = path ? (await supabase.storage.from("platform-qr").createSignedUrl(path, 300)).data?.signedUrl ?? null : null;
  return <>
    <PageHeading eyebrow="Payments" title="Credits and invoices" description="Track platform fees and top up your balance." />
    {owner.fee_mode === "credits" && creditState.data && <CreditBanner state={creditState.data} topUpHref="#top-up" />}
    {onlineTopup && <OnlineTopupStatus {...onlineTopup} />}
    <OwnerCredits ownerId={owner.id} rows={(ledger.data ?? []) as never}
      balance={Number(creditState.data?.available ?? 0)} minimum={Number(values.get("min_credit_to_list") ?? 500)}
      accountName={String(values.get("platform_account_name") ?? "")} qrUrl={qrUrl}
      onlineTopup={config && <OnlineTopup minimum={minimumTopup} maximum={maximumTopup} />} />
    {(owner.fee_mode === "invoice" || Boolean(invoices.data?.length)) && <section id="invoices" className="mt-5 rounded-xl border bg-white p-4 text-sm">
      <h2 className="font-semibold">Commission invoices</h2>
      {invoices.data?.length ? <ul className="mt-2 divide-y">
        {invoices.data.map(invoice => <li key={invoice.id} className="py-2">
          {invoice.period_month.slice(0, 7)} · {paymentPeso(invoice.commission_due)} · {invoice.status}
          {invoice.due_date && ` · Due ${invoice.due_date}`}
        </li>)}
      </ul> : <p className="mt-2">No invoices yet.</p>}
    </section>}
  </>;
}
