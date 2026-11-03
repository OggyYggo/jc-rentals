import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/shared";

function safeNextPath(value: string | null) {
  if (value !== "/account/profile" && value !== "/account/bookings") return "/account/bookings";
  return value;
}

export async function GET(request: NextRequest) {
  if (!isSupabaseConfigured()) return NextResponse.redirect(new URL("/login", request.url));
  const code = request.nextUrl.searchParams.get("code");
  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
        if (profile?.role === "owner") return NextResponse.redirect(new URL("/owner", request.url));
        if (profile?.role === "admin") return NextResponse.redirect(new URL("/admin", request.url));
      }
      return NextResponse.redirect(new URL(safeNextPath(request.nextUrl.searchParams.get("next")), request.url));
    }
  }
  return NextResponse.redirect(new URL("/login?error=auth", request.url));
}
