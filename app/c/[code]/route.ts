import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { normalizePromoSource } from "@/lib/promo/qr";

export async function GET(request: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const origin = (process.env.NEXT_PUBLIC_SITE_URL || request.nextUrl.origin).replace(/\/$/, "");
  if (!/^[a-z2-9]{6}$/i.test(code)) return NextResponse.redirect(`${origin}/cars`);

  const supabase = await createClient();
  const { data: car } = await supabase.from("cars").select("id,owner_id,is_active").eq("short_code", code.toLowerCase()).eq("is_active", true).maybeSingle();
  if (!car) return NextResponse.redirect(`${origin}/cars`);

  const src = normalizePromoSource(request.nextUrl.searchParams.get("src"));
  const admin = createAdminClient();
  if (admin) await admin.from("promo_clicks").insert({ car_id: car.id, owner_id: car.owner_id, src });

  const response = NextResponse.redirect(`${origin}/cars/${car.id}`);
  response.cookies.set("kb_ref", JSON.stringify({ o: car.owner_id, c: car.id, s: src }), {
    maxAge: 60 * 60 * 24 * 30,
    httpOnly: true,
    sameSite: "lax",
    secure: origin.startsWith("https://"),
    path: "/",
  });
  return response;
}
