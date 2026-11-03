import { ArrowDownRight, ArrowUpRight, CircleDollarSign, FileText, Wallet } from "lucide-react";
import { PageHeading, StatCard, StatusPill, formatPeso, formatShortDate } from "@/components/owner/ui";
import { getOwnerContext } from "@/lib/owner-context";

type EarningsBooking = {
  id: string; reference: string; created_at: string; start_date: string; total_price: number;
  commission_amount: number; owner_earnings: number; status: string; payment: string;
  car: { brand: string; model: string } | null;
};

export default async function OwnerEarningsPage() {
  const { supabase, owner } = await getOwnerContext();
  const { data, error } = await supabase.from("bookings").select("id, reference, created_at, start_date, total_price, commission_amount, owner_earnings, status, payment, car:cars(brand, model)").eq("owner_id", owner.id).order("created_at", { ascending: false });
  if (error) throw new Error("Could not load your earnings report.");
  const bookings = (data ?? []) as unknown as EarningsBooking[];
  const included = bookings.filter((booking) => ["confirmed", "picked_up", "returned", "completed"].includes(booking.status));
  const now = new Date();
  const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const thisMonth = included.filter((booking) => booking.created_at.startsWith(monthKey));
  const gross = thisMonth.reduce((sum, booking) => sum + Number(booking.total_price), 0);
  const fee = thisMonth.reduce((sum, booking) => sum + Number(booking.commission_amount), 0);
  const net = thisMonth.reduce((sum, booking) => sum + Number(booking.owner_earnings), 0);
  const collected = thisMonth.filter((booking) => booking.payment === "paid").reduce((sum, booking) => sum + Number(booking.total_price), 0);

  const months = Array.from({ length: 6 }, (_, index) => {
    const date = new Date(now.getFullYear(), now.getMonth() - 5 + index, 1);
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
    const rows = included.filter((booking) => booking.created_at.startsWith(key));
    return { label: new Intl.DateTimeFormat("en", { month: "short" }).format(date), gross: rows.reduce((sum, row) => sum + Number(row.total_price), 0), net: rows.reduce((sum, row) => sum + Number(row.owner_earnings), 0) };
  });
  const maxValue = Math.max(...months.map(({ gross: value }) => value), 1);

  return <>
    <PageHeading eyebrow="Finance" title="Earnings" description="Track rental revenue, the platform fee, and your net earnings." action={<span className="inline-flex h-9 items-center gap-2 rounded-lg border border-[#e1e7ef] bg-white px-3 text-[10px] font-medium text-[#6f7d91]"><FileText size={13}/>Current month</span>}/>
    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><StatCard title="Gross bookings" value={formatPeso(gross)} note={`${thisMonth.length} confirmed rentals`} icon={CircleDollarSign} tone="blue"/><StatCard title="Platform fee" value={formatPeso(fee)} note={`${(Number(owner.commission_rate) * 100).toFixed(1)}% commission`} icon={ArrowDownRight} tone="orange"/><StatCard title="Your net earnings" value={formatPeso(net)} note="Gross less platform fee" icon={Wallet} tone="green"/><StatCard title="Payments received" value={formatPeso(collected)} note={`${thisMonth.filter((booking) => booking.payment === "paid").length} payments recorded`} icon={ArrowUpRight} tone="violet"/></section>

    <section className="mt-5 grid gap-4 xl:grid-cols-[minmax(0,1.55fr)_minmax(280px,.75fr)]">
      <article className="rounded-xl border border-[#e7ecf3] bg-white p-4 shadow-[0_2px_6px_rgba(20,42,78,.025)] sm:p-5"><div><h2 className="text-sm font-semibold text-[#33445b]">Gross and net earnings</h2><p className="mt-1 text-[10px] text-[#8b97a8]">Six-month booking totals</p></div><div className="mt-6 flex h-56 items-end gap-3 border-b border-[#edf0f4] px-1 sm:gap-6 sm:px-4">{months.map((month) => <div key={month.label} className="flex h-full flex-1 flex-col items-center justify-end"><div className="flex h-[85%] w-full max-w-14 items-end gap-1"><div title={`Gross ${formatPeso(month.gross)}`} className="w-1/2 rounded-t bg-[#9bb0ec]" style={{ height: `${Math.max(month.gross ? 6 : 1, (month.gross / maxValue) * 100)}%` }}/><div title={`Net ${formatPeso(month.net)}`} className="w-1/2 rounded-t bg-[#4f76d9]" style={{ height: `${Math.max(month.net ? 6 : 1, (month.net / maxValue) * 100)}%` }}/></div><span className="mb-2 mt-2 text-[9px] text-[#8995a6]">{month.label}</span></div>)}</div><div className="mt-4 flex flex-wrap gap-4 text-[10px] text-[#7f8b9d]"><span className="flex items-center gap-1.5"><i className="h-2 w-2 rounded-sm bg-[#9bb0ec]"/>Gross revenue</span><span className="flex items-center gap-1.5"><i className="h-2 w-2 rounded-sm bg-[#4f76d9]"/>Owner net</span></div></article>
      <article className="rounded-xl border border-[#e7ecf3] bg-white p-4 shadow-[0_2px_6px_rgba(20,42,78,.025)] sm:p-5"><h2 className="text-sm font-semibold text-[#33445b]">This month’s breakdown</h2><p className="mt-1 text-[10px] text-[#8b97a8]">Confirmed and completed bookings</p><div className="mt-7 rounded-xl bg-[#f7f9fd] p-4"><p className="text-[10px] text-[#8491a4]">Gross bookings</p><p className="mt-1 text-2xl font-semibold tracking-tight text-[#293b54]">{formatPeso(gross)}</p></div><div className="mt-4 space-y-3.5"><div className="flex items-center justify-between text-[11px] text-[#758298]"><span>Platform fee</span><span className="font-medium text-[#4e5d73]">−{formatPeso(fee)}</span></div><div className="h-px bg-[#edf0f4]"/><div className="flex items-center justify-between text-[11px] text-[#46566d]"><span className="font-medium">Your net earnings</span><span className="text-sm font-semibold">{formatPeso(net)}</span></div><div className="flex items-center justify-between text-[11px] text-[#758298]"><span>Payment collection</span><span className="font-medium text-[#4e5d73]">{gross ? `${Math.round((collected / gross) * 100)}%` : "—"}</span></div></div></article>
    </section>

    <section className="mt-5 overflow-hidden rounded-xl border border-[#e7ecf3] bg-white shadow-[0_2px_6px_rgba(20,42,78,.025)]"><div className="border-b border-[#edf0f4] px-4 py-4 sm:px-5"><h2 className="text-sm font-semibold text-[#33445b]">Booking earnings</h2><p className="mt-1 text-[10px] text-[#8b97a8]">Individual gross, fee, and net amounts</p></div>{included.length ? <div className="overflow-x-auto"><table className="w-full min-w-[780px] text-left"><thead className="bg-[#f9fafc] text-[9px] font-medium uppercase tracking-wide text-[#8d99aa]"><tr><th className="px-5 py-3">Booking</th><th className="px-4 py-3">Date</th><th className="px-4 py-3">Gross</th><th className="px-4 py-3">Platform fee</th><th className="px-4 py-3">Net</th><th className="px-4 py-3">Payment</th><th className="px-4 py-3">Status</th></tr></thead><tbody className="divide-y divide-[#f0f2f6]">{included.map((booking) => <tr key={booking.id} className="text-[10px] text-[#68778c]"><td className="px-5 py-3.5"><span className="font-semibold text-[#45556c]">{booking.reference}</span><span className="mt-0.5 block text-[9px] text-[#8995a6]">{booking.car ? `${booking.car.brand} ${booking.car.model}` : "Vehicle"}</span></td><td className="px-4 py-3.5">{formatShortDate(booking.start_date)}</td><td className="px-4 py-3.5 font-medium text-[#45556c]">{formatPeso(Number(booking.total_price))}</td><td className="px-4 py-3.5">{formatPeso(Number(booking.commission_amount))}</td><td className="px-4 py-3.5 font-semibold text-[#45556c]">{formatPeso(Number(booking.owner_earnings))}</td><td className="px-4 py-3.5 capitalize">{booking.payment}</td><td className="px-4 py-3.5"><StatusPill status={booking.status}/></td></tr>)}</tbody></table></div> : <div className="px-5 py-12 text-center"><p className="text-xs font-medium text-[#56657b]">No confirmed earnings yet</p><p className="mt-1 text-[10px] text-[#8b97a8]">Confirmed bookings will appear here.</p></div>}</section>
  </>;
}
