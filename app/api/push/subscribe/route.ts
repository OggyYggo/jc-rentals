import { createAdminClient } from "@/lib/supabase/admin";
import { trustedPushEndpoint } from "@/lib/notifications/push-endpoint";
import { createClient } from "@/lib/supabase/server";
import { allowPushRegistration, configuredPushPublicKey, sameOriginPushRequest } from "@/lib/notifications/push-access";

type BrowserSubscription = { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown }; transfer?: unknown };

export async function GET(request: Request) {
  if (!sameOriginPushRequest(request)) return Response.json({ error: "Invalid origin." }, { status: 403 });
  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) return Response.json({ subscribed: false }, { status: 401 });
  const endpoint = new URL(request.url).searchParams.get("endpoint");
  if (!endpoint) return Response.json({ state: "none", subscribed: false });
  const trusted = trustedPushEndpoint(endpoint);
  if (!trusted) return Response.json({ error: "Invalid push endpoint." }, { status: 400 });
  const admin = createAdminClient();
  if (!admin) return Response.json({ error: "Alerts are not set up on the server yet." }, { status: 503 });
  const { data, error } = await admin.from("push_subscriptions").select("user_id").eq("endpoint", trusted).maybeSingle();
  if (error) return Response.json({ error: "Could not check this device." }, { status: 500 });
  const state = data ? data.user_id === user.id ? "mine" : "other" : "none";
  return Response.json({ state, subscribed: state === "mine" }, { headers: { "Cache-Control": "private, no-store" } });
}

export async function POST(request: Request) {
  if (!sameOriginPushRequest(request, true)) return Response.json({ error: "Invalid origin." }, { status: 403 });
  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) return Response.json({ error: "Sign in to enable notifications." }, { status: 401 });
  if (!allowPushRegistration(user.id)) return Response.json({ error: "Try again in a minute." }, { status: 429, headers: { "Retry-After": "60" } });
  const subscription = await request.json().catch(() => null) as BrowserSubscription | null;
  const endpoint = typeof subscription?.endpoint === "string" ? trustedPushEndpoint(subscription.endpoint) : null;
  const p256dh = typeof subscription?.keys?.p256dh === "string" ? subscription.keys.p256dh : "";
  const auth = typeof subscription?.keys?.auth === "string" ? subscription.keys.auth : "";
  if (!endpoint || !/^[A-Za-z0-9_-]{87}$/.test(p256dh) || !/^[A-Za-z0-9_-]{22}$/.test(auth)) {
    return Response.json({ error: "Invalid push subscription." }, { status: 400 });
  }
  const admin = createAdminClient();
  if (!admin || !configuredPushPublicKey()) return Response.json({ error: "Alerts are not set up on the server yet." }, { status: 503 });
  const keys = { p256dh, auth, user_agent: request.headers.get("user-agent")?.slice(0, 500) ?? null };
  const { error } = await admin.from("push_subscriptions").insert({ user_id: user.id, endpoint, ...keys });
  if (error?.code === "23505") {
    const { data: existing, error: lookupError } = await admin.from("push_subscriptions").select("user_id").eq("endpoint", endpoint).maybeSingle();
    if (lookupError || !existing) return Response.json({ error: "Could not save this device." }, { status: 503 });
    const transfer = existing.user_id !== user.id;
    const linked = () => Response.json({ state: "other", error: "This phone is set up for another account." }, { status: 409 });
    if (transfer && subscription?.transfer !== true) return linked();
    const update = admin.from("push_subscriptions").update(transfer ? {
      ...keys, user_id: user.id, created_at: new Date().toISOString(), last_used_at: null,
    } : keys).eq("user_id", existing.user_id).eq("endpoint", endpoint);
    // Protect a transfer against an endpoint-only claim and against concurrent re-links.
    if (transfer) update.eq("p256dh", p256dh).eq("auth", auth);
    const { data, error: updateError } = await update.select("id").maybeSingle();
    if (updateError) return Response.json({ error: "Could not save this device." }, { status: 503 });
    if (!data) return linked();
    if (transfer) console.info("Push subscription re-linked to a different account.");
  } else if (error) return Response.json({ error: "Could not save this device." }, { status: 503 });
  const { error: preferenceError } = await db.from("notification_preferences").upsert({ user_id: user.id, push_enabled: true }, { onConflict: "user_id" });
  if (preferenceError) return Response.json({ error: "Device saved, but notification preference could not be updated." }, { status: 500 });
  return Response.json({ ok: true });
}

export async function DELETE(request: Request) {
  if (!sameOriginPushRequest(request, true)) return Response.json({ error: "Invalid origin." }, { status: 403 });
  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) return Response.json({ error: "Sign in to manage notifications." }, { status: 401 });
  const payload = await request.json().catch(() => null) as { endpoint?: unknown } | null;
  const endpoint = typeof payload?.endpoint === "string" && trustedPushEndpoint(payload.endpoint);
  if (!endpoint) return Response.json({ error: "Invalid push endpoint." }, { status: 400 });
  const admin = createAdminClient();
  if (!admin) return Response.json({ error: "Push registration is unavailable." }, { status: 503 });
  const { data, error } = await admin.from("push_subscriptions").delete().eq("user_id", user.id).eq("endpoint", endpoint).select("id").maybeSingle();
  if (error) return Response.json({ error: "Could not remove this device." }, { status: 500 });
  return Response.json({ ok: true, removed: Boolean(data) });
}
