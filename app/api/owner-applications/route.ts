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
  address?: unknown;
  plate_number?: unknown;
  seats?: unknown;
  transmission?: unknown;
  fuel_type?: unknown;
  offers_self_drive?: unknown;
  offers_with_driver?: unknown;
  daily_rate_self_drive?: unknown;
  daily_rate_with_driver?: unknown;
  pickup_location?: unknown;
  accepted_terms?: unknown;
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
    address: text(payload.address) || null,
    plate_number: text(payload.plate_number).toUpperCase(),
    seats: text(payload.seats) ? Number(payload.seats) : null,
    transmission: text(payload.transmission) || null,
    fuel_type: text(payload.fuel_type) || null,
    offers_self_drive: payload.offers_self_drive === true,
    offers_with_driver: payload.offers_with_driver === true,
    daily_rate_self_drive: text(payload.daily_rate_self_drive) ? Number(payload.daily_rate_self_drive) : null,
    daily_rate_with_driver: text(payload.daily_rate_with_driver) ? Number(payload.daily_rate_with_driver) : null,
    pickup_location: text(payload.pickup_location) || null,
  };
  const validPhone = /^(?:\+?63|0)9\d{9}$/.test(application.phone.replace(/[\s()-]/g, ""));
  const valid = application.full_name.length >= 2 && application.full_name.length <= 120
    && application.business_name.length >= 2 && application.business_name.length <= 120
    && application.email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(application.email)
    && validPhone
    && application.car_make.length >= 2 && application.car_make.length <= 80
    && application.car_model.length >= 1 && application.car_model.length <= 80
    && (application.car_year === null || (Number.isInteger(application.car_year) && application.car_year >= 1900 && application.car_year <= 2100))
    && application.message.length <= 2000
    && application.plate_number.length >= 3 && application.plate_number.length <= 20
    && (application.seats === null || (Number.isInteger(application.seats) && application.seats >= 1 && application.seats <= 50))
    && (application.transmission === null || ["manual", "automatic"].includes(application.transmission))
    && (application.offers_self_drive || application.offers_with_driver)
    && (!application.offers_self_drive || (application.daily_rate_self_drive !== null && Number.isFinite(application.daily_rate_self_drive) && application.daily_rate_self_drive > 0))
    && (!application.offers_with_driver || (application.daily_rate_with_driver !== null && Number.isFinite(application.daily_rate_with_driver) && application.daily_rate_with_driver > 0))
    && payload.accepted_terms === true;
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
  if (insertError?.code === "23505") return NextResponse.json({ error: "We already have an open application for this email." }, { status: 409 });
  if (insertError) return NextResponse.json({ error: "Could not submit your application. Please try again." }, { status: 500 });
  return NextResponse.json({ ok: true });
}
