import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { deliverAlert } from "@/lib/admin-alerts/delivery";
import { secretsMatch } from "@/lib/admin-alerts/mail";

export const maxDuration = 60;

export async function POST(request: Request) {
  if (!secretsMatch(process.env.NOTIFY_WEBHOOK_SECRET, request.headers.get("x-webhook-secret"))) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  const db = createAdminClient();
  if (!db) return Response.json({ error: "server_not_configured" }, { status: 503 });
  try {
    let ids: string[];
    if (new URL(request.url).searchParams.get("sweep") === "1") {
      const { data, error } = await db.rpc("sweep_admin_alerts");
      if (error) throw new Error("Sweep failed.");
      ids = data as string[];
    } else {
      const payload = await request.json().catch(() => null);
      const id = z.uuid().safeParse(payload?.record?.id);
      if (!id.success) return Response.json({ error: "invalid_payload" }, { status: 400 });
      ids = [id.data];
    }
    const deadline = Date.now() + 45_000;
    let failures = 0;
    let count = 0;
    for (let offset = 0; offset < ids.length && Date.now() < deadline; offset += 4) {
      const results = await Promise.allSettled(ids.slice(offset, offset + 4).map(id => deliverAlert(db, id)));
      count += results.length;
      failures += results.filter(result => result.status === "rejected" || result.value === "failed").length;
    }
    return Response.json({ ok: failures === 0, count, failed: failures }, { status: failures ? 502 : 200 });
  } catch {
    return Response.json({ error: "dispatch_failed" }, { status: 500 });
  }
}
