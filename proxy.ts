import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/proxy";

export async function proxy(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: [
    "/((?!pricing(?:/|$)|_next/static|_next/image|favicon.ico|sw\\.js|api/(?:health|csp-report)(?:/|$)|api/notifications/dispatch|api/admin-alerts/(?:dispatch|digest)|api/payments/bayadgate/callback(?:/|$)|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
