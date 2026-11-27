import { createAdminClient } from "@/lib/supabase/admin";
import { trustedPushEndpoint } from "@/lib/notifications/push-endpoint";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

type BrowserSubscription = { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } };

function sameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  return origin !== null && origin === new URL(request.url).origin;
}

export async function GET(request: Request) {
  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) return NextResponse.json({ subscribed: false }, { status: 401 });
  const endpoint = new URL(request.url).searchParams.get("endpoint");
  if (!endpoint) return NextResponse.json({ subscribed: false });
  const { data, error } = await db.from("push_subscriptions").select("id").eq("user_id", user.id).eq("endpoint", endpoint).maybeSingle();
  if (error) return NextResponse.json({ error: "Could not check this device." }, { status: 500 });
  return NextResponse.json({ subscribed: Boolean(data) });
}

export async function POST(request: Request) {
  if (!sameOrigin(request)) return NextResponse.json({ error: "Invalid origin." }, { status: 403 });
  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in to enable notifications." }, { status: 401 });
  const subscription = await request.json().catch(() => null) as BrowserSubscription | null;
  const endpoint = typeof subscription?.endpoint === "string" ? trustedPushEndpoint(subscription.endpoint) : null;
  const p256dh = typeof subscription?.keys?.p256dh === "string" ? subscription.keys.p256dh : "";
  const auth = typeof subscription?.keys?.auth === "string" ? subscription.keys.auth : "";
  if (!endpoint || !/^[A-Za-z0-9_-]{87}$/.test(p256dh) || !/^[A-Za-z0-9_-]{22}$/.test(auth)) {
    return NextResponse.json({ error: "Invalid push subscription." }, { status: 400 });
  }
  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: "Push registration is unavailable." }, { status: 503 });
  const keys = { p256dh, auth, user_agent: request.headers.get("user-agent")?.slice(0, 500) ?? null };
  const { error } = await admin.from("push_subscriptions").insert({ user_id: user.id, endpoint, ...keys });
  if (error?.code === "23505") {
    const { data, error: updateError } = await admin.from("push_subscriptions").update(keys)
      .eq("user_id", user.id).eq("endpoint", endpoint).select("id").maybeSingle();
    if (updateError) return NextResponse.json({ error: "Could not save this device." }, { status: 503 });
    if (!data) return NextResponse.json({ error: "This device is linked to another account." }, { status: 409 });
  } else if (error) return NextResponse.json({ error: "Could not save this device." }, { status: 503 });
  const { error: preferenceError } = await db.from("notification_preferences").upsert({ user_id: user.id, push_enabled: true }, { onConflict: "user_id" });
  if (preferenceError) return NextResponse.json({ error: "Device saved, but notification preference could not be updated." }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request) {
  if (!sameOrigin(request)) return NextResponse.json({ error: "Invalid origin." }, { status: 403 });
  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in to manage notifications." }, { status: 401 });
  const payload = await request.json().catch(() => null) as { endpoint?: unknown } | null;
  if (typeof payload?.endpoint !== "string") return NextResponse.json({ error: "Invalid push endpoint." }, { status: 400 });
  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: "Push registration is unavailable." }, { status: 503 });
  const { error } = await admin.from("push_subscriptions").delete().eq("user_id", user.id).eq("endpoint", payload.endpoint);
  if (error) return NextResponse.json({ error: "Could not remove this device." }, { status: 500 });
  return NextResponse.json({ ok: true });
}
