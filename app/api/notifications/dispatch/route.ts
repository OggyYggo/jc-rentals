import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendPush } from "@/lib/notifications/push";

type NotificationRow = { id: string; user_id: string; type: string; title: string; body: string | null; url: string | null; channels: string[]; critical: boolean; email_sent_at: string | null; push_sent_at: string | null; delivery_attempts: number };

export async function POST(request: Request) {
  const secret = process.env.NOTIFY_WEBHOOK_SECRET;
  if (!secret || request.headers.get("x-webhook-secret") !== secret) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const db = createAdminClient();
  if (!db) return NextResponse.json({ error: "server_not_configured" }, { status: 503 });
  const url = new URL(request.url);
  let rows: NotificationRow[];
  if (url.searchParams.get("sweep") === "1") {
    const since = new Date(Date.now() - 86400000).toISOString();
    const [emailResult, pushResult] = await Promise.all([
      db.from("notifications").select("*").contains("channels", ["email"]).is("email_sent_at", null).lt("delivery_attempts", 3).gte("created_at", since).limit(100),
      db.from("notifications").select("*").contains("channels", ["push"]).is("push_sent_at", null).lt("delivery_attempts", 3).gte("created_at", since).limit(100),
    ]);
    if (emailResult.error || pushResult.error) return NextResponse.json({ error: emailResult.error?.message ?? pushResult.error?.message }, { status: 500 });
    rows = [...new Map([...(emailResult.data ?? []), ...(pushResult.data ?? [])].map((row) => [row.id, row as NotificationRow])).values()];
  } else {
    const payload = await request.json().catch(() => null) as { record?: NotificationRow } | null;
    if (!payload?.record?.id) return NextResponse.json({ error: "invalid_payload" }, { status: 400 });
    rows = [payload.record];
  }
  const results = await Promise.all(rows.map((row) => deliver(db, row)));
  return NextResponse.json({ ok: true, count: rows.length, failed: results.filter(Boolean).length });
}

async function deliver(db: NonNullable<ReturnType<typeof createAdminClient>>, row: NotificationRow) {
  const errors: string[] = [];
  const patch: Record<string, unknown> = { delivery_attempts: row.delivery_attempts + 1 };
  if (row.channels.includes("email") && !row.email_sent_at) {
    try {
      const apiKey = process.env.RESEND_API_KEY;
      const from = process.env.EMAIL_FROM;
      if (!apiKey || !from) throw new Error("Email delivery is not configured.");
      const { data, error } = await db.auth.admin.getUserById(row.user_id);
      if (error || !data.user?.email) throw new Error("Notification recipient email is unavailable.");
      const response = await fetch("https://api.resend.com/emails", { method: "POST", headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" }, body: JSON.stringify({ from, to: [data.user.email], subject: row.title, text: [row.body, row.url ? `Open: ${row.url}` : ""].filter(Boolean).join("\n\n") }) });
      if (!response.ok) throw new Error(`Resend returned ${response.status}.`);
      patch.email_sent_at = new Date().toISOString();
    } catch (error) { errors.push(error instanceof Error ? error.message : "Email delivery failed."); }
  }
  if (row.channels.includes("push") && !row.push_sent_at) {
    try {
      if (await sendPush(db, row)) patch.push_sent_at = new Date().toISOString();
    } catch (error) { errors.push(error instanceof Error ? `Push: ${error.message}` : "Push delivery failed."); }
  }
  patch.delivery_error = errors.join("; ") || null;
  await db.from("notifications").update(patch).eq("id", row.id);
  return errors.length > 0;
}
