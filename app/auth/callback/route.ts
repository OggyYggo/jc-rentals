import { NextResponse, type NextRequest } from "next/server";
import { accountReturnPath, googleNextCookie } from "@/lib/auth/google-redirect";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/shared";

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;

  function returnTo(path: string, clearHash = false) {
    const target = new URL(path, request.url);
    // An explicit fragment prevents browsers from carrying over OAuth error details.
    if (clearHash) target.hash = "#";
    const response = NextResponse.redirect(target);
    response.cookies.set(googleNextCookie, "", { path: "/auth/callback", maxAge: 0 });
    return response;
  }

  if (params.get("error") === "access_denied") return returnTo("/login?error=auth_cancelled", true);
  if (!isSupabaseConfigured()) return returnTo("/login", true);

  const code = params.get("code");
  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
        if (profile?.role === "owner") return returnTo("/owner");
        if (profile?.role === "admin") return returnTo("/admin");
      }
      return returnTo(accountReturnPath(params.get("next") ?? request.cookies.get(googleNextCookie)?.value));
    }
  }
  return returnTo("/login?error=auth", true);
}
