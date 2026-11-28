import { pickupReturnPath } from "@/lib/auth/google-redirect";
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/shared";
import { staffAcceptPath } from "@/lib/staff/content";

const allowedTypes = new Set(["email", "invite", "recovery", "magiclink", "email_change"]);
const allowedNext = new Set(["/", "/account/profile", "/account/bookings", "/owner", "/owner/welcome", "/auth/reset-password"]);

export async function GET(request: NextRequest) {
  const url = request.nextUrl;
  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type");
  const next = url.searchParams.get("next") || "/";
  if (!isSupabaseConfigured() || !tokenHash || !type || !allowedTypes.has(type)) {
    return NextResponse.redirect(new URL("/login?error=auth", request.url));
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: type as "email" | "invite" | "recovery" | "magiclink" | "email_change" });
  if (error) return NextResponse.redirect(new URL("/login?error=auth", request.url));

  const { data: { user } } = await supabase.auth.getUser();
  const { data: profile } = user
    ? await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle()
    : { data: null };

  if (type === "recovery") return NextResponse.redirect(new URL("/auth/reset-password", request.url));
  const staff = staffAcceptPath(next);
  if (staff) return NextResponse.redirect(new URL(staff,request.url));
  if (type === "invite" && profile?.role === "owner") return NextResponse.redirect(new URL("/owner/welcome", request.url));
  const pickup = pickupReturnPath(next);
  if (pickup) return NextResponse.redirect(new URL(pickup,request.url));
  if (profile?.role === "admin") return NextResponse.redirect(new URL("/admin", request.url));
  if (profile?.role === "owner") return NextResponse.redirect(new URL("/owner", request.url));
  if (type === "email") return NextResponse.redirect(new URL("/account/welcome", request.url));
  return NextResponse.redirect(new URL(allowedNext.has(next) ? next : "/", request.url));
}
