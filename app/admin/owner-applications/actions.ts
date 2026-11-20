"use server";

import { reasonError } from "@/lib/alerts/reason";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { getAdminContext } from "@/lib/admin-context";
import { createAdminClient } from "@/lib/supabase/admin";

export async function approveOwnerApplication(id: string) {
  const { supabase } = await getAdminContext();
  const admin = createAdminClient();
  if (!admin) return { error: "Supabase admin access is not configured." };
  const { data: application, error: loadError } = await admin.from("owner_applications").select("*").eq("id", id).eq("status", "pending").single();
  if (loadError || !application) return { error: "This application is no longer pending." };
  const chosenCode = application.preferred_plan ?? "starter";
  const { data: chosenPlan } = await admin.from("plans").select("code,name").eq("code", chosenCode).maybeSingle();
  const chosenPlanName = chosenPlan?.name ?? "Starter";

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
      data: { full_name: application.full_name, role: "owner", preferred_plan: chosenPlan?.code ?? "starter", preferred_plan_name: escapeHtml(chosenPlanName) },
    });
    if (error || !invited.user) return { error: error?.message || "Could not send the account invitation." };
    userId = invited.user.id;
  }

  const { error: approvalError } = await supabase.rpc("admin_complete_owner_application", { p_application_id: id, p_user_id: userId });
  if (approvalError) return { error: "Could not complete the application approval. Check that it is still pending and try again." };
  revalidatePath("/admin/owner-applications");
  return { ok: true, existingAccount: Boolean(existing) };
}

function escapeHtml(value: string) { return value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char] ?? char); }

export async function updateOwnerApplication(id: string, status: "needs_changes" | "rejected", note: string) {
  const { supabase } = await getAdminContext();
  const cleanNote = note.trim();
  if (status !== "needs_changes" && status !== "rejected") return { error: "Could not update this application." };
  const validationError = reasonError(cleanNote);
  if (validationError) return { error: validationError };
  const { error } = await supabase.rpc("admin_request_application_changes", { p_application_id: id, p_status: status, p_reason: cleanNote });
  if (error) return { error: "Could not update this application." };
  revalidatePath("/admin/owner-applications");
  return { ok: true };
}
