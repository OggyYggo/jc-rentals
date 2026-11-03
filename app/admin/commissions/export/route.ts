import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

function csvCell(value: unknown) { let text = String(value ?? ""); if (/^[\s]*[=+\-@\t\r]/.test(text)) text = `'${text}`; return `"${text.replaceAll('"', '""')}"`; }
export async function GET(request: Request) {
  const url = new URL(request.url); const month = url.searchParams.get("month") ?? "";
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) return NextResponse.json({ error: "Provide a month in YYYY-MM format." }, { status: 400 });
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (profile?.role !== "admin") return NextResponse.json({ error: "Administrator access required." }, { status: 403 });
  const [year, m] = month.split("-").map(Number); const start = `${month}-01`; const end = new Date(Date.UTC(year, m, 1)).toISOString().slice(0, 10);
  const [{ data: owners, error: ownerError }, { data: bookings, error: bookingError }] = await Promise.all([
    supabase.from("owners").select("id, business_name").order("business_name"),
    supabase.from("bookings").select("owner_id, total_price, commission_amount, owner_earnings").gte("created_at", `${start}T00:00:00`).lt("created_at", `${end}T00:00:00`).in("status", ["confirmed", "picked_up", "returned", "completed"]),
  ]);
  if (ownerError || bookingError) return NextResponse.json({ error: "Could not create commission report." }, { status: 500 });
  const totals = new Map<string, { count: number; gross: number; fee: number; net: number }>();
  for (const b of bookings ?? []) { if (!b.owner_id) continue; const t = totals.get(b.owner_id) ?? { count: 0, gross: 0, fee: 0, net: 0 }; t.count++; t.gross += Number(b.total_price); t.fee += Number(b.commission_amount); t.net += Number(b.owner_earnings); totals.set(b.owner_id, t); }
  const lines = [["month", "owner", "booking_count", "gross_php", "platform_fee_php", "owner_net_php"], ...(owners ?? []).map(owner => { const t = totals.get(owner.id) ?? { count: 0, gross: 0, fee: 0, net: 0 }; return [month, owner.business_name, t.count, t.gross.toFixed(2), t.fee.toFixed(2), t.net.toFixed(2)]; })];
  const body = lines.map(row => row.map(csvCell).join(",")).join("\r\n");
  return new NextResponse(body, { headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="commissions-${month}.csv"`, "cache-control": "private, no-store" } });
}
