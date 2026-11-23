"use server";

import { SITE_URL } from "@/lib/site-url";

import { createHash, createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { queueSubmissionAlert } from "@/lib/admin-alerts/delivery";
import { applicationSchema } from "@/lib/apply/schema";
import { DOC_TYPES, IMAGE_TYPES, MAX_FILE_BYTES, UPLOADS, type UploadKind } from "@/lib/apply/constants";

type FileMeta = { kind: UploadKind; name: string; type: string; size: number; path?: string };
const bucket = "owner-applications";
function secret() { return process.env.APPLY_COOKIE_SECRET ?? ""; }
function sign(email: string) { return createHmac("sha256", secret()).update(email).digest("hex"); }
function isValidFile(file: FileMeta, kind: UploadKind) {
  if (!file || typeof file !== "object" || typeof file.name !== "string" || typeof file.type !== "string" || !Number.isInteger(file.size) || file.name.length < 1 || file.name.length > 255) return false;
  const allowed = kind === "orcr" || kind === "license" || kind === "valid_id" ? DOC_TYPES : IMAGE_TYPES;
  const extensionTypes: Record<string, string> = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", pdf: "application/pdf" };
  const ext = file.name.split(".").pop()?.toLowerCase();
  return file.kind === kind && allowed.includes(file.type as never) && extensionTypes[ext ?? ""] === file.type && file.size > 0 && file.size <= MAX_FILE_BYTES;
}
async function verifyTurnstile(token: string, ip: string) {
  const secretKey = process.env.TURNSTILE_SECRET_KEY;
  if (!token || !secretKey) return false;
  const form = new URLSearchParams({ secret: secretKey, response: token, remoteip: ip });
  const response = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", { method: "POST", body: form, cache: "no-store" }).catch(() => null);
  if (!response?.ok) return false;
  const result = await response.json().catch(() => null) as { success?: boolean } | null;
  return result?.success === true;
}

export async function startApplication(input: unknown, captchaToken: string, files: FileMeta[]) {
  const ipHeaders = await headers();
  const ip = ipHeaders.get("x-real-ip") ?? ipHeaders.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  if (!(await verifyTurnstile(captchaToken, ip))) return { ok: false as const, error: "Please complete the check and try again." };
  if (secret().length < 32) return { ok: false as const, error: "Applications are temporarily unavailable." };

  const admin = createAdminClient();
  const hmacSecret = process.env.SUPABASE_SECRET_KEY;
  if (!admin || !hmacSecret) return { ok: false as const, error: "Applications are temporarily unavailable." };
  const ipHash = createHmac("sha256", hmacSecret).update(ip).digest("hex");
  const { data: allowed, error: limitError } = await admin.rpc("consume_owner_application_rate_limit", { p_ip_hash: ipHash });
  if (limitError || !allowed) return { ok: false as const, error: "Too many applications were submitted. Please try again later." };

  const parsed = applicationSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]> };
  const requestedPlan = parsed.data.preferred_plan;
  const validPlanCode = /^[a-z][a-z0-9_]{1,30}$/.test(requestedPlan) ? requestedPlan : "starter";
  const { data: selectedPlan } = await admin.from("plans").select("code").eq("code", validPlanCode).eq("is_public", true).eq("is_active", true).maybeSingle();
  const preferredPlan = selectedPlan?.code ?? "starter";
  if (!Array.isArray(files) || files.length < 7 || files.length > 12 || files.some((file) => !file || !UPLOADS.includes(file.kind))) return { ok: false as const, error: "Add 3 to 8 vehicle photos and all four required documents." };
  const photos = files.filter((file) => file.kind === "car_photos");
  if (photos.length < 3 || photos.length > 8 || ["orcr", "license", "valid_id", "payment_qr"].some((kind) => files.filter((file) => file.kind === kind).length !== 1) || files.some((file) => !isValidFile(file, file.kind))) {
    return { ok: false as const, error: "Check your files. Add 3 to 8 vehicle photos and one valid file for each required document." };
  }
  const rows = files.map((file) => ({ ...file, path: `${randomUUID()}.${file.name.split(".").pop()?.toLowerCase()}` }));
  const cancelToken = randomUUID();
  const { data: application, error: insertError } = await admin.from("owner_applications").insert({
    vehicle_type: parsed.data.vehicle_type, car_type: parsed.data.car_type ?? null, engine_cc: parsed.data.vehicle_type === "motorcycle" ? parsed.data.engine_cc ?? null : null,
    helmets_included: parsed.data.vehicle_type === "motorcycle" ? parsed.data.helmets_included : 0,
    full_name: parsed.data.full_name, email: parsed.data.email, phone: parsed.data.phone, address: parsed.data.address,
    business_name: `${parsed.data.car_make} ${parsed.data.car_model}`, car_make: parsed.data.car_make, car_model: parsed.data.car_model,
    car_year: parsed.data.car_year, plate_number: parsed.data.plate_number, seats: parsed.data.seats, transmission: parsed.data.transmission,
    fuel_type: parsed.data.fuel_type, offers_self_drive: parsed.data.offers_self_drive, offers_with_driver: parsed.data.offers_with_driver,
    daily_rate_self_drive: parsed.data.offers_self_drive ? parsed.data.daily_rate_self_drive : null,
    daily_rate_with_driver: parsed.data.offers_with_driver ? parsed.data.daily_rate_with_driver : null,
    pickup_location: parsed.data.pickup_location, notes: parsed.data.notes ?? "", message: parsed.data.notes ?? "", status: "pending",
    preferred_plan: preferredPlan,
    submitted_ip: ip === "unknown" ? null : ip, edit_token_hash: createHash("sha256").update(cancelToken).digest("hex"),
  }).select("id").single();
  if (insertError?.code === "23505") return { ok: false as const, fieldErrors: { email: ["We already have an open application for this email."] } };
  if (insertError || !application) return { ok: false as const, error: "Could not submit your application. Please try again." };

  const uploads = await Promise.all(rows.map(async (row) => {
    const path = `${application.id}/${row.kind}/${row.path}`;
    const { data, error } = await admin.storage.from(bucket).createSignedUploadUrl(path, { upsert: false });
    return { kind: row.kind, path, token: data?.token, error };
  }));
  if (uploads.some((upload) => upload.error || !upload.token)) {
    await admin.from("owner_applications").delete().eq("id", application.id);
    return { ok: false as const, error: "We could not prepare your secure file uploads. Please try again." };
  }
  return { ok: true as const, applicationId: application.id, cancelToken, uploads: uploads.map(({ kind, path, token }) => ({ kind, path, token: token! })) };
}

export async function cancelApplication(applicationId: string, cancelToken: string) {
  const admin = createAdminClient();
  if (!admin || !/^[0-9a-f-]{36}$/i.test(applicationId) || !/^[0-9a-f-]{36}$/i.test(cancelToken)) return;
  const hash = createHash("sha256").update(cancelToken).digest("hex");
  const { data: application } = await admin.from("owner_applications").select("id").eq("id", applicationId).eq("edit_token_hash", hash).eq("status", "pending").maybeSingle();
  if (!application) return;
  const top = await admin.storage.from(bucket).list(applicationId, { limit: 20 });
  const paths: string[] = [];
  for (const folder of top.data ?? []) {
    const nested = await admin.storage.from(bucket).list(`${applicationId}/${folder.name}`, { limit: 100 });
    for (const file of nested.data ?? []) paths.push(`${applicationId}/${folder.name}/${file.name}`);
  }
  if (paths.length) await admin.storage.from(bucket).remove(paths);
  await admin.from("owner_applications").delete().eq("id", applicationId).eq("status", "pending");
}

export async function finalizeApplication(applicationId: string, cancelToken: string, files: FileMeta[]) {
  const admin = createAdminClient();
  if (!admin || !/^[0-9a-f-]{36}$/i.test(applicationId) || !/^[0-9a-f-]{36}$/i.test(cancelToken)) return { ok: false as const, error: "Your upload session expired. Please try again." };
  const cancelHash = createHash("sha256").update(cancelToken).digest("hex");
  const { data: application, error: loadError } = await admin.from("owner_applications").select("id,email,full_name,status,preferred_plan").eq("id", applicationId).eq("edit_token_hash", cancelHash).eq("status", "pending").single();
  if (loadError || !application || !Array.isArray(files) || files.length < 7 || files.length > 12 || files.some((file) => !file || !UPLOADS.includes(file.kind))) return { ok: false as const, error: "Your upload session expired. Please try again." };
  const photos = files.filter((file) => file.kind === "car_photos");
  if (photos.length < 3 || photos.length > 8 || ["orcr", "license", "valid_id", "payment_qr"].some((kind) => files.filter((file) => file.kind === kind).length !== 1) || files.some((file) => !isValidFile(file, file.kind))) return { ok: false as const, error: "Some files are missing or invalid. Please review your uploads." };
  const found = await Promise.all(files.map(async (file) => {
    const prefix = `${applicationId}/${file.kind}/`;
    if (!file.path?.startsWith(prefix)) return null;
    const objectName = file.path.slice(prefix.length);
    if (!/^[0-9a-f-]{36}\.(jpg|jpeg|png|webp|pdf)$/i.test(objectName)) return null;
    const { data } = await admin.storage.from(bucket).list(`${applicationId}/${file.kind}`, { limit: 100 });
    return data?.find((item) => item.name === objectName && item.metadata?.size === file.size && item.metadata?.mimetype === file.type) ?? null;
  }));
  if (found.some((item) => !item)) return { ok: false as const, error: "One or more files did not finish uploading. Please try again." };
  const getPath = (kind: UploadKind) => files.map((file) => file.kind === kind ? file.path! : null).filter(Boolean) as string[];
  const { error: updateError } = await admin.from("owner_applications").update({
    car_photo_paths: getPath("car_photos"), orcr_path: getPath("orcr")[0], license_path: getPath("license")[0], id_path: getPath("valid_id")[0], payment_qr_path: getPath("payment_qr")[0], updated_at: new Date().toISOString(),
    edit_token_hash: null,
  }).eq("id", applicationId).eq("status", "pending").eq("edit_token_hash", cancelHash);
  if (updateError) { await cancelApplication(applicationId, cancelToken); return { ok: false as const, error: "We could not save your application. Please try again." }; }

  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  const { data: preferredPlanRow } = await admin.from("plans").select("name").eq("code", application.preferred_plan).maybeSingle();
  const preferredPlanName = preferredPlanRow?.name ?? "Starter";
  if (apiKey && from) {
    const origin = SITE_URL;
    const emailHtml = `<div style="font-family:Arial,sans-serif;background:#EAF4FF;padding:32px;color:#0F2342"><div style="max-width:560px;margin:auto;background:white;border-radius:18px;padding:32px"><h1>We received your application</h1><p>Hi ${escapeHtml(application.full_name)},</p><p>Thank you for applying to list your vehicle with Kuyog Bohol. We will review it and reply by email.</p><p>Your chosen plan: <strong>${escapeHtml(preferredPlanName)}</strong>. You pay nothing now; if you chose a paid plan, payment is only after approval.</p><p><a href="${origin}/apply" style="color:#0B63CE">Visit Kuyog Bohol</a></p></div></div>`;
    const response = await fetch("https://api.resend.com/emails", { method: "POST", headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" }, body: JSON.stringify({ from, to: [application.email], subject: "We received your application", html: emailHtml }) }).catch((error) => { console.error("Application email failed", error instanceof Error ? error.message : "unknown"); return null; });
    if (response && !response.ok) console.error("Application email failed", response.status);
  }
  await queueSubmissionAlert(admin, "application.submitted", applicationId);
  await admin.rpc("notify_admins", { p_type: "application_received", p_title: `New application from ${application.full_name}, plan: ${preferredPlanName}`, p_body: "A vehicle owner submitted an application.", p_url: "/admin/owner-applications", p_channels: ["in_app"], p_critical: false, p_dedupe: `application:${applicationId}` }).then(({ error }) => { if (error) console.error("Application notification failed", error.message); });
  const cookieStore = await cookies();
  cookieStore.set("apply_email", `${application.email}.${sign(application.email)}`, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/apply/received", maxAge: 600 });
  redirect("/apply/received");
}

export async function getApplicationEmail() {
  const value = (await cookies()).get("apply_email")?.value;
  if (!value || !secret()) return null;
  const separator = value.lastIndexOf(".");
  if (separator < 1) return null;
  const email = value.slice(0, separator); const signature = value.slice(separator + 1); const expected = sign(email);
  if (signature.length !== expected.length || !timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return null;
  return email;
}

export async function getApplicationPlanSummary() {
  const email = await getApplicationEmail();
  const admin = createAdminClient();
  if (!email || !admin) return null;
  const { data: application } = await admin.from("owner_applications").select("preferred_plan").eq("email", email).order("created_at", { ascending: false }).limit(1).maybeSingle();
  const code = application?.preferred_plan ?? "starter";
  const [{ data: plan }, { data: starter }] = await Promise.all([
    admin.from("plans").select("code,name,price_php,max_active_vehicles,commission_rate").eq("code", code).eq("is_public", true).eq("is_active", true).maybeSingle(),
    admin.from("plans").select("max_active_vehicles").eq("code", "starter").maybeSingle(),
  ]);
  return { plan, starterMaxVehicles: starter?.max_active_vehicles ?? null };
}

function escapeHtml(value: string) { return value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char] ?? char); }
