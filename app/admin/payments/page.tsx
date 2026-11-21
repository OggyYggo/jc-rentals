import { AdminHeading } from "@/components/admin/ui";
import { OwnerPaymentReview } from "@/components/owner/payment-review";
import { RefundQueue, type RefundRow } from "@/components/owner/refund-queue";
import { PaymentTabs } from "@/components/payment-tabs";
import { PaymentRisk, type RiskPayment } from "@/components/admin/payment-risk";
import { getAdminContext } from "@/lib/admin-context";
import { paymentDate, paymentPeso } from "@/lib/payment-format";

export const instant = false;
const tabs = { review: "Needs review", risk: "Risk flags", refunds: "Refunds", overdue: "Overdue" };
const ages = { all: "Any age", "1": "At least 1 hour", "4": "At least 4 hours", "8": "At least 8 hours", "24": "At least 1 day" };

type History = {
  id: string; amount: number; status: string; reference_no: string | null; paid_at: string;
  booking: { reference: string; customer: { full_name: string } | null } | null;
  owner: { business_name: string } | null;
};

export default async function AdminPaymentsPage({ searchParams }: { searchParams: Promise<{ tab?: string; owner?: string; age?: string }> }) {
  const { supabase, user } = await getAdminContext();
  const query = await searchParams;
  const tab = query.tab && Object.hasOwn(tabs, query.tab) ? query.tab as keyof typeof tabs : "review";
  const { data: owners, error: ownerError } = await supabase.from("owners").select("id,business_name").order("business_name");
  if (ownerError) throw new Error("Could not load owners.");
  const owner = owners?.some(row => row.id === query.owner) ? query.owner : undefined;
  const age = query.age && Object.hasOwn(ages, query.age) ? query.age : "all";
  const now = new Date().getTime();
  const before = age === "all" ? undefined : new Date(now - Number(age) * 3_600_000).toISOString();

  let content;
  if (tab === "refunds" || tab === "overdue") {
    let request = supabase.from("booking_refunds")
      .select("id,booking_id,amount,due_at,status,refund_proof_path,booking:bookings(reference)").order("due_at");
    if (owner) request = request.eq("owner_id", owner);
    if (before) request = request.lte("created_at", before);
    if (tab === "overdue") request = request.eq("status", "owed").lte("due_at", new Date(now).toISOString());
    const { data, error } = await request.returns<RefundRow[]>();
    if (error) throw new Error("Could not load refunds.");
    content = <>
      {tab === "overdue" && <><h2 className="mb-3 font-semibold">Payments waiting at least eight hours</h2>
        <PendingReview owner={owner} before={before && Date.parse(before) < now - 28_800_000 ? before : new Date(now - 28_800_000).toISOString()} />
        <h2 className="my-3 font-semibold">Overdue refunds</h2></>}
      <RefundQueue refunds={data ?? []} userId={user.id} admin />
    </>;
  } else if (tab === "risk") {
    const columns = "id,proof_path,proof_sha256,flags,paid_at,amount,status,booking:bookings(reference,payment_flags),owner:owners(business_name)";
    let request = supabase.from("payments").select(columns).neq("flags", "{}").order("paid_at", { ascending: false }).limit(100);
    if (owner) request = request.eq("owner_id", owner);
    if (before) request = request.lte("paid_at", before);
    let bookingRequest = supabase.from("bookings").select("id")
      .neq("payment_flags", "{}").order("created_at", { ascending: false }).limit(100);
    if (owner) bookingRequest = bookingRequest.eq("owner_id", owner);
    const [{ data: rows, error }, { data: flaggedBookings, error: bookingError }] = await Promise.all([request.returns<RiskPayment[]>(), bookingRequest]);
    if (error || bookingError) throw new Error("Could not load flagged payments.");
    const merged = new Map((rows ?? []).map(row => [row.id, row]));
    if (flaggedBookings?.length) {
      let related = supabase.from("payments").select(columns).in("booking_id", flaggedBookings.map(row => row.id))
        .order("paid_at", { ascending: false }).limit(100);
      if (before) related = related.lte("paid_at", before);
      const { data, error } = await related.returns<RiskPayment[]>();
      if (error) throw new Error("Could not load booking risk flags.");
      for (const row of data ?? []) merged.set(row.id, row);
    }
    const matchedIds = Array.from(merged.keys());
    const hashes = Array.from(new Set(Array.from(merged.values()).flatMap(row =>
      row.proof_sha256 && row.flags.includes("duplicate_proof") ? [row.proof_sha256] : [])));
    if (hashes.length) {
      const { data, error } = await supabase.from("payments").select(columns).in("proof_sha256", hashes)
        .in("status", ["pending", "verified"]).limit(200).returns<RiskPayment[]>();
      if (error) throw new Error("Could not load matching proofs.");
      for (const row of data ?? []) merged.set(row.id, row);
    }
    const signed = await Promise.all(Array.from(merged.values()).map(async (row) => {
      const url = row.proof_path ? (await supabase.storage.from("payment-proofs").createSignedUrl(row.proof_path, 300)).data?.signedUrl : undefined;
      return [row.id, url ?? ""] as const;
    }));
    content = <PaymentRisk rows={Array.from(merged.values())} urls={Object.fromEntries(signed)} matchedIds={matchedIds} />;
  } else {
    let history = supabase.from("payments").select("id,amount,status,reference_no,paid_at,owner:owners(business_name),booking:bookings(reference,customer:profiles!bookings_customer_id_fkey(full_name))")
      .order("paid_at", { ascending: false }).limit(100);
    if (owner) history = history.eq("owner_id", owner);
    if (before) history = history.lte("paid_at", before);
    const { data, error } = await history.returns<History[]>();
    if (error) throw new Error("Could not load payment history.");
    content = <>
      <PendingReview owner={owner} before={before} />
      <h2 className="my-3 font-semibold">Recent payment activity</h2>
      <div className="overflow-x-auto rounded-xl border bg-white">
        <table className="w-full min-w-[680px] text-left text-sm">
          <thead className="bg-slate-50"><tr>{["Booking", "Owner", "Customer", "Amount", "Reference", "Status", "Submitted (Manila)"].map(label =>
            <th key={label} className="p-3">{label}</th>)}</tr></thead>
          <tbody className="divide-y">{(data ?? []).map(row => <tr key={row.id}>
            {[row.booking?.reference, row.owner?.business_name, row.booking?.customer?.full_name, paymentPeso(row.amount), row.reference_no, row.status, paymentDate(row.paid_at)]
              .map((value, index) => <td key={index} className="p-3">{value ?? "—"}</td>)}
          </tr>)}</tbody>
        </table>
      </div>
    </>;
  }
  return <>
    <AdminHeading eyebrow="Payments" title="Booking deposits" description="Review proofs, disputes and refunds." />
    <PaymentTabs path="/admin/payments" active={tab} tabs={tabs} filters={{ ...(owner ? { owner } : {}), age }} />
    <form className="mb-4 flex flex-wrap items-end gap-3 rounded-xl border bg-white p-3 text-sm">
      <input type="hidden" name="tab" value={tab} />
      <label>Owner<select name="owner" defaultValue={owner ?? ""} className="mt-1 block max-w-full rounded-lg border p-2">
        <option value="">All owners</option>{owners?.map(row => <option key={row.id} value={row.id}>{row.business_name}</option>)}
      </select></label>
      <label>Age<select name="age" defaultValue={age} className="mt-1 block rounded-lg border p-2">
        {Object.entries(ages).map(([key, label]) => <option value={key} key={key}>{label}</option>)}
      </select></label>
      <button className="min-h-11 rounded-lg border px-3 font-semibold text-blue-800">Apply filters</button>
    </form>
    {content}
  </>;
}

async function PendingReview({ owner, before }: { owner?: string; before?: string }) {
  const { supabase } = await getAdminContext();
  let request = supabase.from("payments")
    .select("id,booking_id,amount,reference_no,proof_path,paid_at,proof_sha256,flags,booking:bookings(reference,review_due_at,payment_flags)")
    .eq("status", "pending").order("paid_at");
  if (owner) request = request.eq("owner_id", owner);
  if (before) request = request.lte("paid_at", before);
  const { data, error } = await request;
  if (error) throw new Error("Could not load pending payments.");
  return <OwnerPaymentReview admin payments={(data ?? []) as never} />;
}
