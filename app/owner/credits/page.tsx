import Link from "next/link";
import { CreditBanner, type CreditState } from "@/components/owner/credit-state";
import { PageHeading } from "@/components/owner/ui";
import { getOwnerContext } from "@/lib/owner-context";
import { paymentPeso } from "@/lib/payment-format";
import { OwnerCredits, type CreditRow } from "@/components/owner/credits";
import { OnlineTopup, OnlineTopupStatus } from "@/components/owner/online-topup";
import { MobileCreditsHome } from "@/components/owner/mobile-credits/home";
import { MobileInvoices } from "@/components/owner/mobile-credits/invoices";
import { MobileTopUpAnchor } from "@/components/owner/mobile-credits/navigation";
import { MobilePaymentResult } from "@/components/owner/mobile-credits/status";
import { manilaDay, type CreditActivityRow, type Invoice } from "@/components/owner/mobile-credits/data";
import { expireGatewayTopups, maximumTopup, minimumTopup, orderPattern, quickpayConfig } from "@/lib/payments/quickpay";
import { after } from "next/server";
import { loadPlatformQr } from "./platform-qr";

export const instant = false;

type OwnerClient = Awaited<ReturnType<typeof getOwnerContext>>["supabase"];
type LedgerRow = CreditRow & Pick<CreditActivityRow, "booking"> & { booking_id?: string | null };
const ledgerColumns = "id,type,amount,status,reference_no,proof_path,note,created_at";

async function loadOnlineTopup(supabase: OwnerClient, ownerId: string, value: unknown) {
  if (typeof value !== "string" || !orderPattern.test(value)) return null;
  const { data } = await supabase.from("gateway_topups").select("order_id,status,ledger_id,amount,method")
    .eq("owner_id", ownerId).eq("provider", "quickpay").eq("order_id", value).maybeSingle();
  if (!data) return null;
  return { orderId: data.order_id, status: data.ledger_id ? "paid" : data.status, amount: Number(data.amount), method: data.method };
}

async function loadLedger(supabase: OwnerClient, ownerId: string, includeBookings: boolean) {
  if (includeBookings) {
    const withBookings = await supabase.from("owner_credit_ledger")
      .select(`${ledgerColumns},booking_id,booking:bookings!owner_credit_ledger_booking_id_fkey(reference,car:cars!bookings_car_id_fkey(brand,model))`)
      .eq("owner_id", ownerId).order("created_at", { ascending: false }).returns<LedgerRow[]>();
    if (!withBookings.error) {
      if (withBookings.data?.some(row => row.booking_id && !row.booking)) {
        console.warn("Some credit activity booking details are unavailable.");
      }
      return withBookings;
    }
    console.warn("Could not load credit activity booking details.", withBookings.error.code);
  }
  return supabase.from("owner_credit_ledger").select(ledgerColumns)
    .eq("owner_id", ownerId).order("created_at", { ascending: false }).returns<LedgerRow[]>();
}

async function loadPayoutVerification(supabase: OwnerClient, ownerId: string) {
  const { data, error } = await supabase.from("owners")
    .select("payment_qr_verified,owner_payment_options(is_active,verified)")
    .eq("id", ownerId).maybeSingle();
  if (error) {
    console.warn("Could not load listing payment verification.", error.code);
    return null;
  }
  const options = data?.owner_payment_options ?? [];
  return options.length ? options.some(option => option.is_active && option.verified) : Boolean(data?.payment_qr_verified);
}

async function loadOnlineActivity(supabase: OwnerClient, ownerId: string) {
  const { data, error } = await supabase.from("gateway_topups").select("ledger_id,method")
    .eq("owner_id", ownerId).not("ledger_id", "is", null).order("created_at", { ascending: false });
  if (error) console.warn("Could not load online top-up channels.", error.code);
  return new Map((data ?? []).map(row => [row.ledger_id, { method: row.method }]));
}

async function loadUnfinishedOrder(supabase: OwnerClient, ownerId: string) {
  const { data, error } = await supabase.from("gateway_topups").select("order_id")
    .eq("owner_id", ownerId).eq("provider", "quickpay").eq("status", "created")
    .gte("created_at", new Date(Date.now() - 2 * 60 * 60_000).toISOString())
    .order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (error) console.warn("Could not load unfinished top-ups.", error.code);
  return data?.order_id;
}

export default async function OwnerCreditsPage({ searchParams }: PageProps<"/owner/credits">) {
  const { supabase, owner } = await getOwnerContext();
  const { topup, view, check } = await searchParams;
  const config = quickpayConfig();
  if (config) after(() => expireGatewayTopups(config, owner.id));
  const creditMode = owner.fee_mode === "credits";
  const invoiceView = owner.fee_mode === "invoice" || view === "invoices";
  const [ledger, creditState, settings, invoices, onlineTopup, payoutVerified, onlineActivity, unfinishedOrder] = await Promise.all([
    loadLedger(supabase, owner.id, creditMode && !invoiceView),
    supabase.rpc("owner_credit_state", { p_owner_id: owner.id }).maybeSingle<CreditState>(),
    supabase.from("owner_payment_settings").select("key,value").in("key", ["platform_account_name", "platform_qr_path", "min_credit_to_list"]),
    supabase.from("commission_invoices").select("id,period_month,commission_due,due_date,status,paid_at,total_bookings,gross_amount")
      .eq("owner_id", owner.id).order("period_month", { ascending: false }).returns<Invoice[]>(),
    config ? loadOnlineTopup(supabase, owner.id, topup) : null,
    creditMode && !invoiceView ? loadPayoutVerification(supabase, owner.id) : false,
    creditMode && !invoiceView ? loadOnlineActivity(supabase, owner.id) : null,
    creditMode && !invoiceView && config ? loadUnfinishedOrder(supabase, owner.id) : undefined,
  ]);
  if (creditState.error || settings.error || invoices.error) throw new Error("Could not load credits and invoices.");
  if (ledger.error) console.warn("Could not load credit activity.", ledger.error.code);
  const values = new Map((settings.data ?? []).map(row => [row.key, row.value]));
  const qr = await loadPlatformQr(supabase, values);
  const state = creditState.data ?? { balance: 0, pending_fees: 0, available: 0, low_threshold: 0 };
  const available = Number(state.available);
  const minimum = Number(values.get("min_credit_to_list") ?? 500);
  const invoiceRows = invoices.data ?? [];
  const rows = ledger.data ?? [];
  const mobile = invoiceView
    ? <MobileInvoices invoices={invoiceRows} today={manilaDay(new Date())} history={creditMode} />
    : onlineTopup
      ? <MobilePaymentResult key={onlineTopup.orderId} order={onlineTopup} available={available} visible={payoutVerified === true && available >= minimum} />
      : <MobileCreditsHome state={state} minimum={minimum} rate={Number(owner.commission_rate) * 100}
          payoutVerified={payoutVerified} activityUnavailable={Boolean(ledger.error)} rows={rows.map(({ id, type, amount, note, status, created_at, booking }) =>
            ({ id, type, amount, note, status, created_at, booking, online: onlineActivity?.get(id) }))}
          unfinishedOrder={unfinishedOrder} hasInvoices={invoiceRows.length > 0} />;

  return <>
    {creditMode && <MobileTopUpAnchor />}
    <div className="hidden lg:block">
      <PageHeading eyebrow="Payments" title="Credits and invoices" description="Track platform fees and top up your balance." />
      {creditMode && creditState.data && <CreditBanner state={creditState.data} topUpHref="#top-up" />}
    </div>
    {onlineTopup ? <OnlineTopupStatus {...onlineTopup} mobile={mobile} /> : mobile}
    <div className="hidden lg:block">
      {check === "payment" && <section className="mb-4 rounded-xl border border-[#F1D798] bg-[#FFF2D6] p-4 text-sm text-[#8A5A00]" role="status">
        <h2 className="font-heading font-bold">Check your recent payments</h2>
        {unfinishedOrder ? <Link href={`/owner/credits?topup=${unfinishedOrder}`} className="inline-flex min-h-11 items-center font-semibold underline">View recent online payment</Link>
          : <p>Review your credit activity and wallet history before starting another payment.</p>}
      </section>}
      <OwnerCredits ownerId={owner.id} activityUnavailable={Boolean(ledger.error)} rows={rows.map(({ id, type, amount, status, reference_no, proof_path, note, created_at }) =>
        ({ id, type, amount, status, reference_no, proof_path, note, created_at }))}
        balance={available} minimum={minimum} {...qr}
        onlineTopup={config && <OnlineTopup minimum={minimumTopup} maximum={maximumTopup} />} />
      {(owner.fee_mode === "invoice" || Boolean(invoiceRows.length)) && <section id="invoices" className="mt-5 rounded-xl border bg-white p-4 text-sm">
        <h2 className="font-semibold">Commission invoices</h2>
        {invoiceRows.length ? <ul className="mt-2 divide-y">
          {invoiceRows.map(invoice => <li key={invoice.id} className="py-2">
            {invoice.period_month.slice(0, 7)} · {paymentPeso(invoice.commission_due)} · {invoice.status}
            {invoice.due_date && ` · Due ${invoice.due_date}`}
          </li>)}
        </ul> : <p className="mt-2">No invoices yet.</p>}
      </section>}
    </div>
  </>;
}
