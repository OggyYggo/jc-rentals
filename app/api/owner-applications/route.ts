import { createHmac } from "node:crypto";
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

type ApplicationPayload = {
  full_name?: unknown;
  business_name?: unknown;
  email?: unknown;
  phone?: unknown;
  car_make?: unknown;
  car_model?: unknown;
  car_year?: unknown;
  message?: unknown;
  website?: unknown;
};

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export async function POST(request: Request) {
  let payload: ApplicationPayload;
  try {
    const body = await request.text();
    if (new TextEncoder().encode(body).byteLength > 10_000) return NextResponse.json({ error: "Application is too large." }, { status: 413 });
    const parsed: unknown = JSON.parse(body);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return NextResponse.json({ error: "Invalid application." }, { status: 400 });
    payload = parsed as ApplicationPayload;
  } catch {
    return NextResponse.json({ error: "Invalid application." }, { status: 400 });
  }

  // Quietly accept filled honeypots so simple bots do not keep retrying.
  if (text(payload.website)) return NextResponse.json({ ok: true });

  const application = {
    full_name: text(payload.full_name),
    business_name: text(payload.business_name),
    email: text(payload.email).toLowerCase(),
    phone: text(payload.phone),
    car_make: text(payload.car_make),
    car_model: text(payload.car_model),
    car_year: text(payload.car_year) ? Number(payload.car_year) : null,
    message: text(payload.message),
  };
  const valid = application.full_name.length >= 2 && application.full_name.length <= 120
    && application.business_name.length >= 2 && application.business_name.length <= 120
    && application.email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(application.email)
    && application.phone.length >= 7 && application.phone.length <= 30
    && application.car_make.length >= 2 && application.car_make.length <= 80
    && application.car_model.length >= 1 && application.car_model.length <= 80
    && (application.car_year === null || (Number.isInteger(application.car_year) && application.car_year >= 1900 && application.car_year <= 2100))
    && application.message.length <= 2000;
  if (!valid) return NextResponse.json({ error: "Check the application fields and try again." }, { status: 400 });

  const secret = process.env.SUPABASE_SECRET_KEY;
  const supabase = createAdminClient();
  if (!secret || !supabase) return NextResponse.json({ error: "Applications are temporarily unavailable." }, { status: 503 });

  const forwarded = request.headers.get("x-real-ip") ?? request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const ipHash = createHmac("sha256", secret).update(forwarded).digest("hex");
  const { data: allowed, error: limitError } = await supabase.rpc("consume_owner_application_rate_limit", { p_ip_hash: ipHash });
  if (limitError) return NextResponse.json({ error: "Applications are temporarily unavailable." }, { status: 503 });
  if (!allowed) return NextResponse.json(
    { error: "Too many applications were submitted. Please try again in an hour." },
    { status: 429, headers: { "Retry-After": "3600" } },
  );

  const { error: insertError } = await supabase.from("owner_applications").insert(application);
  if (insertError) return NextResponse.json({ error: "Could not submit your application. Please try again." }, { status: 500 });
  return NextResponse.json({ ok: true });
}
