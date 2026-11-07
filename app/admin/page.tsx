import Link from "next/link";
import { ArrowRight, CalendarDays, CarFront, CircleDollarSign, FileCheck2, Store, Users } from "lucide-react";
import { AdminHeading, AdminStat, AdminStatus, peso } from "@/components/admin/ui";
import { getAdminContext } from "@/lib/admin-context";

export const instant = false;

type RecentBooking = { id: string; reference: string; created_at: string; total_price: number; status: string; customer: { full_name: string } | null; owner: { business_name: string } | null; car: { brand: string; model: string } | null };

export default async function AdminOverviewPage() {
  const { supabase } = await getAdminContext();
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const [owners, cars, customers, pending, monthBookings, recent] = await Promise.all([
    supabase.from("owners").select("id", { count: "exact", head: true }),
    supabase.from("cars").select("id", { count: "exact", head: true }),
    supabase.from("profiles").select("id", { count: "exact", head: true }).eq("role", "customer"),
    supabase.from("profiles").select("id", { count: "exact", head: true }).eq("role", "customer").eq("verification", "pending"),
    supabase.from("bookings").select("total_price, commission_amount").gte("created_at", monthStart).in("status", ["confirmed", "picked_up", "returned", "completed"]),
    supabase.from("bookings").select("id, reference, created_at, total_price, status, customer:profiles!bookings_customer_id_fkey(full_name), owner:owners!bookings_owner_id_fkey(business_name), car:cars!bookings_car_id_fkey(brand, model)").order("created_at", { ascending: false }).limit(6),
  ]);
  const monthlyBookings = monthBookings.data ?? [];
  const gross = monthlyBookings.reduce((sum, booking) => sum + Number(booking.total_price), 0);
  const commission = monthlyBookings.reduce((sum, booking) => sum + Number(booking.commission_amount), 0);
  const recentBookings = (recent.data ?? []) as unknown as RecentBooking[];
  const error = owners.error || cars.error || customers.error || pending.error || monthBookings.error || recent.error;
  if (error) throw new Error("Could not load the platform overview.");

  return <>
    <AdminHeading eyebrow="Platform overview" title="Admin dashboard" description="Monitor rental activity and manage the Kuyog Bohol marketplace." action={<Link href="/admin/bookings" className="inline-flex h-9 items-center gap-2 rounded-lg border border-[#dfe5ed] bg-white px-3 text-[11px] font-medium text-[#5f6f85] hover:bg-[#f8faff]"><CalendarDays size={14}/>All bookings</Link>}/>
    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><AdminStat title="Rental owners" value={String(owners.count ?? 0)} note="Registered businesses" icon={Store} tone="blue"/><AdminStat title="Fleet vehicles" value={String(cars.count ?? 0)} note="Vehicles across the platform" icon={CarFront} tone="violet"/><AdminStat title="Customers" value={String(customers.count ?? 0)} note={`${pending.count ?? 0} awaiting verification`} icon={Users} tone="orange"/><AdminStat title="Monthly commission" value={peso(commission)} note={`${monthlyBookings.length} confirmed rentals · ${peso(gross)} gross`} icon={CircleDollarSign} tone="green"/></section>
    <section className="mt-5 grid gap-4 xl:grid-cols-[minmax(0,1.45fr)_minmax(280px,.75fr)]"><article className="overflow-hidden rounded-xl border border-[#e7ecf3] bg-white shadow-[0_2px_6px_rgba(20,42,78,.025)]"><div className="flex items-center justify-between border-b border-[#edf0f4] px-4 py-4 sm:px-5"><div><h2 className="text-sm font-semibold text-[#33445b]">Recent bookings</h2><p className="mt-1 text-[10px] text-[#8b97a8]">Latest activity from all owners</p></div><Link href="/admin/bookings" className="text-[10px] font-semibold text-[#4b6dc4] hover:underline">View all</Link></div>{recentBookings.length ? <div className="overflow-x-auto"><table className="w-full min-w-[650px] text-left"><thead className="bg-[#f9fafc] text-[9px] font-medium uppercase tracking-wide text-[#8d99aa]"><tr><th className="px-5 py-3">Customer / reference</th><th className="px-4 py-3">Owner</th><th className="px-4 py-3">Vehicle</th><th className="px-4 py-3">Gross</th><th className="px-4 py-3">Status</th></tr></thead><tbody className="divide-y divide-[#f0f2f6]">{recentBookings.map((booking) => <tr key={booking.id} className="text-[10px] text-[#68778c]"><td className="px-5 py-3.5"><span className="font-medium text-[#42536a]">{booking.customer?.full_name || "Customer"}</span><span className="mt-0.5 block text-[9px] text-[#9aa4b2]">{booking.reference}</span></td><td className="px-4 py-3.5">{booking.owner?.business_name || "—"}</td><td className="px-4 py-3.5">{booking.car ? `${booking.car.brand} ${booking.car.model}` : "—"}</td><td className="px-4 py-3.5 font-semibold text-[#42536a]">{peso(Number(booking.total_price))}</td><td className="px-4 py-3.5"><AdminStatus status={booking.status}/></td></tr>)}</tbody></table></div> : <div className="px-5 py-14 text-center text-xs text-[#8793a3]">Booking activity will appear here.</div>}</article>
      <article className="rounded-xl border border-[#e7ecf3] bg-white p-4 shadow-[0_2px_6px_rgba(20,42,78,.025)] sm:p-5"><h2 className="text-sm font-semibold text-[#33445b]">Admin shortcuts</h2><p className="mt-1 text-[10px] text-[#8b97a8]">Common platform tasks</p><div className="mt-4 space-y-2">{[{href:"/admin/customers",label:"Review customer verification",note:`${pending.count ?? 0} pending`,icon:FileCheck2},{href:"/admin/owners",label:"Manage rental owners",note:`${owners.count ?? 0} owners`,icon:Store},{href:"/admin/commissions",label:"View monthly commissions",note:"Reports and CSV export",icon:CircleDollarSign}].map(({href,label,note,icon:Icon})=><Link href={href} key={href} className="flex items-center gap-3 rounded-lg border border-[#edf0f4] p-3 transition hover:bg-[#f8faff]"><span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#edf2ff] text-[#4c6fc9]"><Icon size={15}/></span><span className="min-w-0 flex-1"><span className="block text-[10px] font-semibold text-[#4b5b72]">{label}</span><span className="mt-0.5 block text-[9px] text-[#8b97a8]">{note}</span></span><ArrowRight size={13} className="text-[#91a0b4]"/></Link>)}</div></article>
    </section>
  </>;
}
