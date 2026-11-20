import { createAdminClient } from "@/lib/supabase/admin";
import { deliverAlert } from "@/lib/admin-alerts/delivery";
import { secretsMatch } from "@/lib/admin-alerts/mail";

export const maxDuration = 60;

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secretsMatch(secret && `Bearer ${secret}`, request.headers.get("authorization"))) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  const db = createAdminClient();
  if (!db) return Response.json({ error: "server_not_configured" }, { status: 503 });
  try {
    const { data, error } = await db.rpc("prepare_admin_digest");
    if (error) throw new Error("Could not prepare digest.");
    const result = data ? await deliverAlert(db, data as string) : "skipped";
    return Response.json({ result }, { status: result === "failed" ? 502 : 200 });
  } catch {
    return Response.json({ error: "digest_failed" }, { status: 500 });
  }
}
