import { bookingRevenue, commissionBookingFilter, hasKeptFee, manilaMonth } from "@/lib/booking-revenue";
import Link from "next/link";
import { AdminHeading, adminMoney, mobileAction, mobileCard, peso } from "@/components/admin/ui";
import { getAdminContext } from "@/lib/admin-context";

export const instant = false;

type Props = { searchParams: Promise<{ month?: string }> };
function validMonth(value?: string) { return value && /^\d{4}-(0[1-9]|1[0-2])$/.test(value) ? value : manilaMonth(new Date()); }
function nextMonth(month: string) { const [year, m] = month.split("-").map(Number); return new Date(Date.UTC(year, m, 1)).toISOString().slice(0, 10); }

export default async function AdminCommissionsPage({ searchParams }: Props) {
  const { month: requested } = await searchParams; const month = validMonth(requested); const start = `${month}-01`; const end = nextMonth(month);
  const currentMonth = manilaMonth(new Date());
  const [year, number] = currentMonth.split("-").map(Number);
  const months = Array.from({ length: 6 }, (_, index) => new Date(Date.UTC(year, number - 6 + index, 1)).toISOString().slice(0, 7));
  const monthLabel = (value: string) => new Intl.DateTimeFormat("en-PH", { month: "short", year: "numeric", timeZone: "Asia/Manila" }).format(new Date(value + "-01T00:00:00+08:00"));
  const { supabase } = await getAdminContext();
  const [{ data: owners, error: ownerError }, { data: bookings, error: bookingError }, trend] = await Promise.all([
    supabase.from("owners").select("id, business_name").order("business_name"),
    supabase.from("bookings").select("owner_id, total_price, cancel_fee_amount, commission_amount, owner_earnings, status").gte("created_at", `${start}T00:00:00+08:00`).lt("created_at", `${end}T00:00:00+08:00`).or(commissionBookingFilter),
    Promise.all(months.map(async value => {
      const { data, error } = await supabase.from("bookings").select("commission_amount")
        .gte("created_at", `${value}-01T00:00:00+08:00`).lt("created_at", `${nextMonth(value)}T00:00:00+08:00`).or(commissionBookingFilter);
      return { month: value, total: error ? null : (data ?? []).reduce((sum, row) => sum + Number(row.commission_amount), 0) };
    })),
  ]);
  if (ownerError || bookingError) throw new Error("Could not load commission report.");
  const totals = new Map<string, { count: number; cancelled: number; gross: number; fee: number; net: number }>();
  for (const b of bookings ?? []) { if (!b.owner_id) continue; const t = totals.get(b.owner_id) ?? { count: 0, cancelled: 0, gross: 0, fee: 0, net: 0 }; t.count++; if (hasKeptFee(b)) t.cancelled++; t.gross += bookingRevenue(b); t.fee += Number(b.commission_amount); t.net += Number(b.owner_earnings); totals.set(b.owner_id, t); }
  const commission = (bookings ?? []).reduce((sum, row) => sum + Number(row.commission_amount), 0);
  const gross = (bookings ?? []).reduce((sum, row) => sum + bookingRevenue(row), 0);
  const kept = (bookings ?? []).filter(hasKeptFee).reduce((sum, row) => sum + Number(row.cancel_fee_amount), 0);
  const largestOwnerGross = Math.max(1, ...Array.from(totals.values(), row => row.gross));
  const largestMonth = Math.max(1, ...trend.map(row => row.total ?? 0));

  return <><AdminHeading eyebrow="Finance" title="Monthly commissions" description="Rental revenue and retained cancellation fees by booking creation month." action={<form className="flex flex-wrap gap-2 lg:flex-nowrap"><input aria-label="Commission month" type="month" name="month" defaultValue={month} className="h-9 rounded-lg border border-[#dfe5ec] bg-white px-3 text-xs"/><button className="rounded-lg bg-[#2457d6] px-3 text-xs font-semibold text-white">View</button><a href={`/admin/commissions/export?month=${month}`} className="inline-flex items-center rounded-lg border border-[#dfe5ec] bg-white px-3 text-xs font-semibold text-[#43536a]">Export CSV</a></form>}/>
    <div className="space-y-4 lg:hidden">
      <nav aria-label="Commission months" className="flex gap-2 overflow-x-auto p-1">{[...months].reverse().map(value => <Link key={value} href={`?month=${value}`} aria-current={value === month ? "page" : undefined} className={`${mobileAction} shrink-0 whitespace-nowrap bg-white aria-[current=page]:bg-[#EAF4FF]`}>{monthLabel(value)}</Link>)}</nav>
      <section className="rounded-xl bg-[#0A47B1] p-4 text-white">
        <h2 className="font-semibold">Platform commission · {monthLabel(month)}</h2><p className="my-2 text-3xl font-semibold">{adminMoney(commission)}</p>
        <dl className="space-y-1 text-[13px]"><div className="flex flex-wrap justify-between gap-2"><dt>Gross bookings</dt><dd>{adminMoney(gross)}</dd></div><div className="flex flex-wrap justify-between gap-2"><dt>Cancellation fees kept</dt><dd>{adminMoney(kept)}</dd></div></dl>
      </section>
      <section className={mobileCard}><h2 className="mb-2 font-semibold">By owner</h2>
        {owners?.length ? <ul className="divide-y divide-[#E3EEF9]">{owners.map(owner => {
          const row = totals.get(owner.id);
          return <li key={owner.id} className="space-y-1 py-3"><div className="flex flex-wrap justify-between gap-2"><strong>{owner.business_name}</strong><strong>{adminMoney(row?.fee ?? 0)}</strong></div>
            <p className="text-[#5B6F89]">{adminMoney(row?.gross ?? 0)} gross · {row?.count ?? 0} bookings</p><progress aria-label={`${owner.business_name} gross bookings`} value={row?.gross ?? 0} max={largestOwnerGross} className="h-2 w-full accent-[#0A47B1]"/></li>;
        })}</ul> : <p>No owners found.</p>}
      </section>
      <section className={mobileCard}><h2 className="mb-3 font-semibold">Last six months</h2>
        <ul className="space-y-2">{trend.map(row => <li key={row.month} className="grid grid-cols-[3rem_1fr_auto] items-center gap-2 text-[13px]">
          <span>{monthLabel(row.month).split(" ")[0]}</span><span className="h-2 overflow-hidden rounded-full bg-[#F3F9FF]"><span className={`block h-full rounded-full ${row.month === currentMonth ? "bg-[#0A47B1]" : "bg-[#C9DAF3]"}`} style={{ width: `${100 * (row.total ?? 0) / largestMonth}%` }}/></span><span>{row.total === null ? "Unavailable" : adminMoney(row.total)}</span>
        </li>)}</ul>
      </section>
    </div>
    <div className="hidden overflow-x-auto lg:block rounded-xl border border-[#e7ecf3] bg-white"><table className="w-full min-w-[700px] text-left text-xs"><thead className="bg-[#f9fafc] text-[9px] uppercase text-[#8d99aa]"><tr>{["Owner", "Bookings", "Gross", "Platform fee", "Owner net"].map(x => <th key={x} className="px-4 py-3">{x}</th>)}</tr></thead><tbody className="divide-y divide-[#f0f2f6]">{(owners ?? []).map(owner => { const t = totals.get(owner.id) ?? { count: 0, cancelled: 0, gross: 0, fee: 0, net: 0 }; return <tr key={owner.id} className="text-[#68778c]"><td className="px-4 py-3 font-semibold text-[#43536a]">{owner.business_name}</td><td className="px-4 py-3">{t.count}{t.cancelled > 0 && <span className="block">Cancelled (fee kept) {t.cancelled}</span>}</td><td className="px-4 py-3">{peso(t.gross)}</td><td className="px-4 py-3">{peso(t.fee)}</td><td className="px-4 py-3 font-semibold text-[#43536a]">{peso(t.net)}</td></tr>; })}</tbody></table>{!owners?.length && <p className="p-8 text-center text-xs text-[#8793a3]">No owners found.</p>}</div></>;
}
