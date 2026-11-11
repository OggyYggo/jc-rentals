import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

type BrowserSubscription = { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } };

function sameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  return origin !== null && origin === new URL(request.url).origin;
}

export async function POST(request: Request) {
  if (!sameOrigin(request)) return NextResponse.json({ error: "Invalid origin." }, { status: 403 });
  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in to enable notifications." }, { status: 401 });
  const subscription = await request.json().catch(() => null) as BrowserSubscription | null;
  const endpoint = typeof subscription?.endpoint === "string" ? subscription.endpoint : "";
  const p256dh = typeof subscription?.keys?.p256dh === "string" ? subscription.keys.p256dh : "";
  const auth = typeof subscription?.keys?.auth === "string" ? subscription.keys.auth : "";
  try {
    if (new URL(endpoint).protocol !== "https:") throw new Error();
  } catch {
    return NextResponse.json({ error: "Invalid push endpoint." }, { status: 400 });
  }
  if (!p256dh || !auth || endpoint.length > 4096) return NextResponse.json({ error: "Invalid push subscription." }, { status: 400 });

  await db.from("push_subscriptions").delete().eq("user_id", user.id).eq("endpoint", endpoint);
  const { error } = await db.from("push_subscriptions").insert({ user_id: user.id, endpoint, p256dh, auth, user_agent: request.headers.get("user-agent")?.slice(0, 500) ?? null });
  if (error) return NextResponse.json({ error: error.code === "23505" ? "This device is linked to another account." : error.message }, { status: error.code === "23505" ? 409 : 500 });
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
  const { error } = await db.from("push_subscriptions").delete().eq("user_id", user.id).eq("endpoint", payload.endpoint);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
