"use server";

import { revalidatePath } from "next/cache";
import { createHash } from "node:crypto";
import { sendContactEmail } from "@/lib/contact/mail";
import { getOwnerContext } from "@/lib/owner-context";
import { SITE_URL } from "@/lib/site-url";
import { bookingIdPattern } from "@/lib/pickup/model";
import { staffError } from "./content";

type Invitation = { id: string; token: string; business: string; email: string };
type ActionResult = { message?: string; error?: string };

async function deliver(invite: Invitation) {
  const link = new URL("/staff/accept", SITE_URL);
  link.searchParams.set("token", invite.token);
  const result = await sendContactEmail({
    to: invite.email, subject: "Your Kuyog Bohol handover staff invitation",
    text: `${invite.business} invited you to help with vehicle handovers. Open the link and use this email address to accept. This link expires in 7 days.\n\n${link.href}`,
    idempotencyKey: `staff-invite/${createHash("sha256").update(invite.token).digest("hex")}`,
  });
  revalidatePath("/owner/staff");
  revalidatePath(`/owner/staff/${invite.id}`);
  return result.accepted
    ? { message: `Invite sent to ${invite.email}` }
    : { error: "The invitation was saved, but the email could not be sent. Open the staff member’s details to resend it." };
}

export async function inviteStaff(name: string, email: string): Promise<ActionResult> {
  const { supabase } = await getOwnerContext();
  if (typeof name !== "string" || typeof email !== "string" || name.length > 100 || email.length > 254) {
    return { error: staffError("STAFF_INVALID_DETAILS") };
  }
  const { data, error } = await supabase.rpc("owner_invite_staff", { p_name: name, p_email: email });
  return error || !data ? { error: staffError(error?.message ?? "") } : deliver(data as Invitation);
}

export async function resendStaffInvite(id: string): Promise<ActionResult> {
  const { supabase } = await getOwnerContext();
  if (!bookingIdPattern.test(id)) return { error: staffError("STAFF_NOT_ALLOWED") };
  const { data, error } = await supabase.rpc("owner_resend_staff_invite", { p_staff: id });
  return error || !data ? { error: staffError(error?.message ?? "") } : deliver(data as Invitation);
}

export async function setStaffStatus(id: string, status: "active" | "paused" | "removed"): Promise<ActionResult> {
  const { supabase } = await getOwnerContext();
  if (!bookingIdPattern.test(id) || !["active", "paused", "removed"].includes(status)) return { error: staffError("STAFF_NOT_ALLOWED") };
  const { error } = await supabase.rpc("owner_set_staff_status", { p_staff: id, p_status: status });
  if (error) return { error: staffError(error.message) };
  revalidatePath("/owner/staff");
  revalidatePath(`/owner/staff/${id}`);
  return { message: status === "removed" ? "Staff access removed." : status === "paused" ? "Staff access paused." : "Staff access resumed." };
}

