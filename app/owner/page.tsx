import Link from "next/link";
import { ArrowRight, ArrowUpRight, CalendarDays, CarFront, CircleDollarSign, ClipboardList, Plus } from "lucide-react";
import { PageHeading, StatCard, StatusPill, formatPeso, formatShortDate } from "@/components/owner/ui";
import { getOwnerContext } from "@/lib/owner-context";

type BookingRow = {
  id: string;
  reference: string;
  start_date: string;
  end_date: string;
  total_price: number;
  owner_earnings: number;
  status: string;
  customer: { full_name: string } | null;
  car: { brand: string; model: string } | null;
};

export const instant = false;

export default async function OwnerOverviewPage() {
  const { supabase, owner } = await getOwnerContext();
  const [{ data: cars }, { data: bookings }, { data: contacts }] = await Promise.all([
    supabase.from("cars").select("id, brand, model, year, is_active, allows_self_drive, allows_with_driver").eq("owner_id", owner.id),
    supabase.from("bookings").select("id, reference, start_date, end_date, total_price, owner_earnings, status, created_at, customer_id, car:cars(brand, model)").eq("owner_id", owner.id).order("created_at", { ascending: false }).limit(100),
    supabase.from("owner_booking_contacts").select("booking_id, full_name, phone"),
  ]);

  const contactByBooking = new Map((contacts ?? []).map((contact) => [contact.booking_id, contact]));
  const allBookings = (bookings ?? []).map((booking) => ({ ...booking, customer: contactByBooking.get(booking.id) ?? null })) as unknown as (BookingRow & { created_at: string })[];
  const carList = cars ?? [];
  const now = new Date();
  const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const eligible = allBookings.filter((booking) => ["confirmed", "picked_up", "returned", "completed"].includes(booking.status));
  const monthBookings = eligible.filter((booking) => booking.created_at.startsWith(monthKey));
  const gross = monthBookings.reduce((sum, booking) => sum + Number(booking.total_price), 0);
  const net = monthBookings.reduce((sum, booking) => sum + Number(booking.owner_earnings), 0);
  const pendingCount = allBookings.filter((booking) => booking.status === "pending").length;
  const activeRentals = allBookings.filter((booking) => booking.status === "picked_up").length;
  const rate = Number(owner.commission_rate) * 100;

  const chartMonths = Array.from({ length: 6 }, (_, index) => {
    const date = new Date(now.getFullYear(), now.getMonth() - 5 + index, 1);
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
    const amount = eligible.filter((booking) => booking.created_at.startsWith(key)).reduce((sum, booking) => sum + Number(booking.owner_earnings), 0);
    return { label: new Intl.DateTimeFormat("en", { month: "short" }).format(date), amount };
  });
  const maxChart = Math.max(...chartMonths.map(({ amount }) => amount), 1);
  const recent = allBookings.slice(0, 6);

  return <>
    <PageHeading eyebrow="Owner dashboard" title={`Good morning, ${owner.business_name}`} description="Here’s how your rental business is doing today." action={<div className="flex gap-2"><Link href="/owner/calendar" className="inline-flex h-9 items-center gap-2 rounded-lg border border-[#dfe5ed] bg-white px-3 text-[11px] font-medium text-[#5f6f85] hover:bg-[#f8faff]"><CalendarDays size={14}/>Calendar</Link><Link href="/owner/cars?new=1" className="inline-flex h-9 items-center gap-2 rounded-lg bg-[#2457d6] px-3.5 text-[11px] font-semibold text-white shadow-sm hover:bg-[#1d4ed8]"><Plus size={14}/>Add car</Link></div>} />

    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <StatCard title="Total vehicles" value={String(carList.length)} note={`${carList.filter((car) => car.is_active).length} active in fleet`} icon={CarFront} tone="blue"/>
      <StatCard title="Booking requests" value={String(pendingCount).padStart(2, "0")} note="Waiting for your response" icon={ClipboardList} tone="orange"/>
      <StatCard title="Gross bookings · this month" value={formatPeso(gross)} note={`${monthBookings.length} confirmed rentals`} icon={CircleDollarSign} tone="green"/>
      <StatCard title="Your earnings · this month" value={formatPeso(net)} note={`${rate}% platform fee`} icon={CircleDollarSign} tone="violet"/>
    </section>

    <section className="mt-5 grid gap-4 xl:grid-cols-[minmax(0,1.65fr)_minmax(280px,.8fr)]">
      <article className="rounded-xl border border-[#e7ecf3] bg-white p-4 shadow-[0_2px_6px_rgba(20,42,78,.025)] sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-sm font-semibold text-[#33445b]">Earnings overview</h2><p className="mt-1 text-[10px] text-[#8b97a8]">Your net earnings over the last six months</p></div><Link href="/owner/earnings" className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-[#e4e9f0] px-2.5 text-[10px] font-medium text-[#68778c] hover:bg-[#f8faff]">View report <ArrowRight size={12}/></Link></div>
        <div className="mt-6 grid grid-cols-6 gap-2 sm:gap-4">{chartMonths.map(({ label, amount }) => <div key={label} className="flex flex-col items-center"><div className="flex h-36 w-full items-end overflow-hidden rounded-t-md bg-[#f4f7fd] sm:h-44"><div className="w-full rounded-t-md bg-[#6f91e8] transition-all" style={{ height: `${Math.max(amount ? 8 : 2, (amount / maxChart) * 100)}%` }} title={formatPeso(amount)}/></div><span className="mt-2 text-[9px] text-[#8b97a8]">{label}</span></div>)}</div>
        <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-[#eef1f5] pt-4 text-[10px] text-[#7c899d]"><span className="flex items-center gap-1.5"><i className="h-2 w-2 rounded-sm bg-[#6f91e8]"/>Net earnings</span><span className="flex items-center gap-1 text-[#3c8b6a]"><ArrowUpRight size={12}/>Based on stored owner earnings</span></div>
      </article>

      <article className="rounded-xl border border-[#e7ecf3] bg-white p-4 shadow-[0_2px_6px_rgba(20,42,78,.025)] sm:p-5"><div className="flex items-start justify-between"><div><h2 className="text-sm font-semibold text-[#33445b]">Earnings breakdown</h2><p className="mt-1 text-[10px] text-[#8b97a8]">This month</p></div><span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#edf2ff] text-[#4c6fc9]"><CircleDollarSign size={16}/></span></div><div className="mt-7"><p className="text-[10px] text-[#8995a6]">Total gross</p><p className="mt-1 text-2xl font-semibold tracking-tight text-[#2a3b53]">{formatPeso(gross)}</p></div><div className="my-5 h-px bg-[#edf0f4]"/><div className="space-y-3 text-[11px]"><div className="flex justify-between text-[#758298]"><span>Platform fee ({rate}%)</span><span className="font-medium text-[#45556c]">−{formatPeso(gross - net)}</span></div><div className="flex justify-between text-[#45556c]"><span>Your net earnings</span><span className="font-semibold">{formatPeso(net)}</span></div></div><Link href="/owner/earnings" className="mt-6 flex h-9 items-center justify-center gap-2 rounded-lg bg-[#f2f5fd] text-[10px] font-semibold text-[#4669c4] hover:bg-[#eaf0ff]">Open earnings report <ArrowRight size={13}/></Link></article>
    </section>

    <section className="mt-5 grid gap-4 xl:grid-cols-[minmax(0,1.4fr)_minmax(280px,.9fr)]">
      <article className="overflow-hidden rounded-xl border border-[#e7ecf3] bg-white shadow-[0_2px_6px_rgba(20,42,78,.025)]"><div className="flex items-center justify-between border-b border-[#edf0f4] px-4 py-4 sm:px-5"><div><h2 className="text-sm font-semibold text-[#33445b]">Recent bookings</h2><p className="mt-1 text-[10px] text-[#8b97a8]">The latest activity across your fleet</p></div><Link href="/owner/bookings" className="text-[10px] font-semibold text-[#4b6dc4] hover:underline">See all</Link></div>
        {recent.length ? <div className="overflow-x-auto"><table className="w-full min-w-[620px] text-left"><thead className="bg-[#f9fafc] text-[9px] font-medium uppercase tracking-wide text-[#8d99aa]"><tr><th className="px-5 py-3">Customer</th><th className="px-4 py-3">Vehicle</th><th className="px-4 py-3">Dates</th><th className="px-4 py-3">Amount</th><th className="px-4 py-3">Status</th></tr></thead><tbody className="divide-y divide-[#f0f2f6]">{recent.map((booking) => <tr key={booking.id} className="text-[10px] text-[#68778c]"><td className="px-5 py-3.5"><span className="font-medium text-[#42536a]">{booking.customer?.full_name || "Customer"}</span><span className="mt-0.5 block text-[9px] text-[#9aa4b2]">{booking.reference}</span></td><td className="px-4 py-3.5 text-[#53637a]">{booking.car ? `${booking.car.brand} ${booking.car.model}` : "Vehicle"}</td><td className="px-4 py-3.5">{formatShortDate(booking.start_date)}</td><td className="px-4 py-3.5 font-semibold text-[#42536a]">{formatPeso(Number(booking.total_price))}</td><td className="px-4 py-3.5"><StatusPill status={booking.status}/></td></tr>)}</tbody></table></div> : <div className="px-5 py-12 text-center"><p className="text-xs font-medium text-[#56657b]">No bookings yet</p><p className="mt-1 text-[10px] text-[#8b97a8]">Your booking activity will appear here.</p></div>}
      </article>

      <article className="rounded-xl border border-[#e7ecf3] bg-white p-4 shadow-[0_2px_6px_rgba(20,42,78,.025)] sm:p-5"><div className="flex items-start justify-between"><div><h2 className="text-sm font-semibold text-[#33445b]">Fleet at a glance</h2><p className="mt-1 text-[10px] text-[#8b97a8]">Vehicle availability overview</p></div><Link href="/owner/cars" className="text-[10px] font-semibold text-[#4b6dc4] hover:underline">Manage</Link></div><div className="mt-5 space-y-3">{carList.slice(0, 4).map((car, index) => <div key={car.id} className="flex items-center gap-3 rounded-lg border border-[#eef1f5] p-2.5"><span className={`flex h-9 w-9 items-center justify-center rounded-lg ${["bg-[#edf2ff] text-[#4d6ec7]", "bg-[#edf7f1] text-[#438664]", "bg-[#fff5e8] text-[#bb8235]", "bg-[#f2efff] text-[#755eb4]"][index % 4]}`}><CarFront size={17}/></span><div className="min-w-0 flex-1"><p className="truncate text-[11px] font-semibold text-[#45556c]">{car.year ? `${car.year} ` : ""}{car.brand} {car.model}</p><p className="mt-0.5 text-[9px] text-[#8b97a8]">{car.allows_self_drive && car.allows_with_driver ? "Two rental options" : car.allows_with_driver ? "With driver" : "Self drive"}</p></div><span className={`rounded-full px-2 py-1 text-[9px] ${car.is_active ? "bg-[#edf7f1] text-[#39825f]" : "bg-[#f1f3f6] text-[#7d8999]"}`}>{car.is_active ? "Active" : "Hidden"}</span></div>)}</div>{carList.length === 0 && <div className="py-8 text-center text-[10px] text-[#8b97a8]">Add your first vehicle to get started.</div>}<Link href="/owner/cars?new=1" className="mt-4 flex h-9 items-center justify-center gap-2 rounded-lg border border-dashed border-[#d8e0eb] text-[10px] font-semibold text-[#64748a] hover:border-[#9cb1e7] hover:text-[#4567be]"><Plus size={13}/>Add a vehicle</Link></article>
    </section>
  </>;
}
