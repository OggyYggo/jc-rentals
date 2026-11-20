import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/proxy";

export async function proxy(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: [
    "/((?!pricing(?:/|$)|_next/static|_next/image|favicon.ico|sw\\.js|api/notifications/dispatch|api/admin-alerts/(?:dispatch|digest)|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
