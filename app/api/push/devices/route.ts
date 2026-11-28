import { pushDeviceLabel, sameOriginPushRequest } from "@/lib/notifications/push-access";
import { trustedPushEndpoint } from "@/lib/notifications/push-endpoint";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  if (!sameOriginPushRequest(request)) return Response.json({ error: "Invalid origin." }, { status: 403 });
  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) return Response.json({ error: "Sign in to view your devices." }, { status: 401 });
  const rawEndpoint = new URL(request.url).searchParams.get("endpoint");
  const currentEndpoint = rawEndpoint ? trustedPushEndpoint(rawEndpoint) : null;
  const { data, error } = await db.from("push_subscriptions").select("id,user_agent,created_at,last_used_at,endpoint")
    .eq("user_id", user.id).order("created_at", { ascending: false });
  if (error) return Response.json({ error: "Could not load your devices." }, { status: 500 });
  return Response.json({ devices: (data ?? []).map(row => ({
    id: row.id, ...pushDeviceLabel(row.user_agent), created_at: row.created_at, last_used_at: row.last_used_at,
    current: row.endpoint === currentEndpoint,
  })) }, { headers: { "Cache-Control": "private, no-store" } });
}

export async function DELETE(request: Request) {
  if (!sameOriginPushRequest(request, true)) return Response.json({ error: "Invalid origin." }, { status: 403 });
  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) return Response.json({ error: "Sign in to manage your devices." }, { status: 401 });
  const body = await request.json().catch(() => null) as { id?: unknown; endpoint?: unknown } | null;
  if (typeof body?.id !== "string" || !/^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/i.test(body.id)) return Response.json({ error: "Invalid device." }, { status: 400 });
  const current = typeof body.endpoint === "string" ? trustedPushEndpoint(body.endpoint) : null;
  const admin = createAdminClient();
  if (!admin) return Response.json({ error: "Alerts are not set up on the server yet." }, { status: 503 });
  const query = admin.from("push_subscriptions").delete().eq("user_id", user.id).eq("id", body.id);
  if (current) query.neq("endpoint", current);
  const { data, error } = await query.select("id").maybeSingle();
  if (error) return Response.json({ error: "Could not remove this device." }, { status: 500 });
  return Response.json({ ok: true, removed: Boolean(data) });
}
