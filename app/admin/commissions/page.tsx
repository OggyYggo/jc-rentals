import { AdminHeading, peso } from "@/components/admin/ui";
import { getAdminContext } from "@/lib/admin-context";

export const instant = false;

type Props = { searchParams: Promise<{ month?: string }> };
function validMonth(value?: string) { return value && /^\d{4}-(0[1-9]|1[0-2])$/.test(value) ? value : new Date().toISOString().slice(0, 7); }
function nextMonth(month: string) { const [year, m] = month.split("-").map(Number); return new Date(Date.UTC(year, m, 1)).toISOString().slice(0, 10); }

export default async function AdminCommissionsPage({ searchParams }: Props) {
  const { month: requested } = await searchParams; const month = validMonth(requested); const start = `${month}-01`; const end = nextMonth(month);
  const { supabase } = await getAdminContext();
  const [{ data: owners, error: ownerError }, { data: bookings, error: bookingError }] = await Promise.all([
    supabase.from("owners").select("id, business_name").order("business_name"),
    supabase.from("bookings").select("owner_id, total_price, commission_amount, owner_earnings, status").gte("created_at", `${start}T00:00:00`).lt("created_at", `${end}T00:00:00`).in("status", ["confirmed", "picked_up", "returned", "completed"]),
  ]);
  if (ownerError || bookingError) throw new Error("Could not load commission report.");
  const totals = new Map<string, { count: number; gross: number; fee: number; net: number }>();
  for (const b of bookings ?? []) { if (!b.owner_id) continue; const t = totals.get(b.owner_id) ?? { count: 0, gross: 0, fee: 0, net: 0 }; t.count++; t.gross += Number(b.total_price); t.fee += Number(b.commission_amount); t.net += Number(b.owner_earnings); totals.set(b.owner_id, t); }
  return <><AdminHeading eyebrow="Finance" title="Monthly commissions" description="Recognized bookings by booking creation month. Cancelled and rejected bookings are excluded." action={<form className="flex gap-2"><input type="month" name="month" defaultValue={month} className="h-9 rounded-lg border border-[#dfe5ec] bg-white px-3 text-xs"/><button className="rounded-lg bg-[#2457d6] px-3 text-xs font-semibold text-white">View</button><a href={`/admin/commissions/export?month=${month}`} className="inline-flex items-center rounded-lg border border-[#dfe5ec] bg-white px-3 text-xs font-semibold text-[#43536a]">Export CSV</a></form>}/><div className="overflow-x-auto rounded-xl border border-[#e7ecf3] bg-white"><table className="w-full min-w-[700px] text-left text-xs"><thead className="bg-[#f9fafc] text-[9px] uppercase text-[#8d99aa]"><tr>{["Owner", "Bookings", "Gross", "Platform fee", "Owner net"].map(x => <th key={x} className="px-4 py-3">{x}</th>)}</tr></thead><tbody className="divide-y divide-[#f0f2f6]">{(owners ?? []).map(owner => { const t = totals.get(owner.id) ?? { count: 0, gross: 0, fee: 0, net: 0 }; return <tr key={owner.id} className="text-[#68778c]"><td className="px-4 py-3 font-semibold text-[#43536a]">{owner.business_name}</td><td className="px-4 py-3">{t.count}</td><td className="px-4 py-3">{peso(t.gross)}</td><td className="px-4 py-3">{peso(t.fee)}</td><td className="px-4 py-3 font-semibold text-[#43536a]">{peso(t.net)}</td></tr>; })}</tbody></table>{!owners?.length && <p className="p-8 text-center text-xs text-[#8793a3]">No owners found.</p>}</div></>;
}
