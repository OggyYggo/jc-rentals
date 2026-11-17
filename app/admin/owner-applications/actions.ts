"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { getAdminContext } from "@/lib/admin-context";
import { createAdminClient } from "@/lib/supabase/admin";

export async function approveOwnerApplication(id: string) {
  const { user } = await getAdminContext();
  const admin = createAdminClient();
  if (!admin) return { error: "Supabase admin access is not configured." };
  const { data: application, error: loadError } = await admin.from("owner_applications").select("*").eq("id", id).eq("status", "pending").single();
  if (loadError || !application) return { error: "This application is no longer pending." };

  let userId: string;
  const { data: users, error: usersError } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (usersError) return { error: "Could not check for an existing account." };
  const existing = users.users.find((item) => item.email?.toLowerCase() === application.email.toLowerCase());
  if (existing) userId = existing.id;
  else {
    const requestHeaders = await headers();
    const forwardedHost = requestHeaders.get("x-forwarded-host");
    const host = forwardedHost || requestHeaders.get("host");
    const protocol = requestHeaders.get("x-forwarded-proto") || (host?.startsWith("localhost") ? "http" : "https");
    const candidates = [
      process.env.NEXT_PUBLIC_SITE_URL,
      process.env.NEXT_PUBLIC_APP_URL,
      process.env.VERCEL_PROJECT_PRODUCTION_URL,
      process.env.VERCEL_URL,
      requestHeaders.get("origin"),
      host ? `${protocol}://${host}` : undefined,
    ];
    const siteValue = candidates.find((value) => value?.trim());
    if (!siteValue) return { error: "Could not determine this site's URL. Set NEXT_PUBLIC_SITE_URL in your deployment environment." };
    let site: string;
    try {
      const normalized = /^https?:\/\//i.test(siteValue) ? siteValue : `${siteValue.includes("localhost") ? "http" : "https"}://${siteValue}`;
      site = new URL(normalized).origin;
    } catch {
      return { error: "The configured site URL is invalid. Check NEXT_PUBLIC_SITE_URL." };
    }
    const { data: invited, error } = await admin.auth.admin.inviteUserByEmail(application.email, {
      redirectTo: `${site}/auth/confirm?next=/owner/welcome`,
      data: { full_name: application.full_name, role: "owner" },
    });
    if (error || !invited.user) return { error: error?.message || "Could not send the account invitation." };
    userId = invited.user.id;
  }

  const { error: profileError } = await admin.from("profiles").upsert({ id: userId, full_name: application.full_name, phone: application.phone, role: "owner" });
  if (profileError) return { error: "The account exists, but the owner profile could not be created. Contact support before retrying." };
  const { data: owner, error: ownerError } = await admin.from("owners").upsert({ profile_id: userId, business_name: application.business_name, contact_phone: application.phone, payment_qr_path: application.payment_qr_path ?? null }, { onConflict: "profile_id" }).select("id").single();
  if (ownerError || !owner) return { error: "The profile exists, but the owner record could not be created. Contact support before retrying." };
  const { data: car, error: carError } = await admin.from("cars").insert({
    owner_id: owner.id, brand: application.car_make, model: application.car_model, year: application.car_year,
    plate_number: application.plate_number, seats: application.seats, transmission: application.transmission,
    fuel_type: application.fuel_type, is_active: false, allows_self_drive: application.offers_self_drive,
    allows_with_driver: application.offers_with_driver, description: application.message || "",
  }).select("id").single();
  if (carError || !car) return { error: "The owner was created, but the draft car could not be created. Contact support before retrying." };
  const rates = [
    ...(application.offers_self_drive && application.daily_rate_self_drive ? [{ car_id: car.id, mode: "self_drive", daily_rate: application.daily_rate_self_drive }] : []),
    ...(application.offers_with_driver && application.daily_rate_with_driver ? [{ car_id: car.id, mode: "with_driver", daily_rate: application.daily_rate_with_driver }] : []),
  ];
  if (rates.length) {
    const { error } = await admin.from("car_rates").insert(rates);
    if (error) return { error: "The owner was created, but the draft car rates could not be saved. Contact support before retrying." };
  }
  const { error: updateError } = await admin.from("owner_applications").update({ status: "approved", user_id: userId, reviewed_by: user.id, reviewed_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", id).eq("status", "pending");
  if (updateError) return { error: "The owner account and draft car were created, but the application status could not be updated." };
  revalidatePath("/admin/owner-applications");
  return { ok: true, existingAccount: Boolean(existing) };
}

export async function updateOwnerApplication(id: string, status: "needs_changes" | "rejected", note: string) {
  const { user, supabase } = await getAdminContext();
  const cleanNote = note.trim();
  if (!cleanNote || cleanNote.length > 2000) return { error: "Add a note of up to 2,000 characters." };
  const { error } = await supabase.from("owner_applications").update({ status, admin_note: cleanNote, reviewed_by: user.id, reviewed_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", id).eq("status", "pending");
  if (error) return { error: "Could not update this application." };
  revalidatePath("/admin/owner-applications");
  return { ok: true };
}
