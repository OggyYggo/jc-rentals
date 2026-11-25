import { connection } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET() {
  await connection();
  let healthy = false;
  try {
    const db = createAdminClient();
    if (db) {
      const { error } = await db.from("settings").select("key").limit(1).abortSignal(AbortSignal.timeout(3000));
      healthy = !error;
    }
  } catch {
    // Keep upstream failures and configuration details out of the public response.
  }
  return Response.json({ status: healthy ? "ok" : "unavailable" }, {
    status: healthy ? 200 : 503,
    headers: { "Cache-Control": "no-store" },
  });
}
