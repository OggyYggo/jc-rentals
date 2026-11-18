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
  const now = Date.now();
  let isRepeatClick = false;
  try {
    const previous = request.cookies.get("kb_ref")?.value;
    const saved = previous ? JSON.parse(previous) as { o?: string; c?: string; s?: string; t?: number } : null;
    const clickedAt = saved?.t;
    isRepeatClick = saved?.o === car.owner_id
      && saved?.c === car.id
      && saved?.s === src
      && typeof clickedAt === "number"
      && now >= clickedAt
      && now - clickedAt < 30 * 60 * 1000;
  } catch {
    // Invalid attribution cookies do not prevent a visit from being counted.
  }
  if (admin && !isRepeatClick) await admin.from("promo_clicks").insert({ car_id: car.id, owner_id: car.owner_id, src });

  const response = NextResponse.redirect(`${origin}/cars/${car.id}`);
  response.cookies.set("kb_ref", JSON.stringify({ o: car.owner_id, c: car.id, s: src, t: now }), {
    maxAge: 60 * 60 * 24 * 30,
    httpOnly: true,
    sameSite: "lax",
    secure: origin.startsWith("https://"),
    path: "/",
  });
  return response;
}
