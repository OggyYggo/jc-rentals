import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type StaffBusiness = { owner_id: string; business: string; display_name: string; enabled: boolean };
export type StaffHistory = { reference: string; customer_name: string; vehicle_label: string; kind: string; created_at: string };
export type StaffToday = Omit<StaffHistory, "created_at"> & { handover_time: string | null };
export type OwnerStaffRow = {
  id: string; display_name: string; email: string; status: "active" | "invited" | "paused" | "removed";
  invited_at: string; accepted_at: string | null; last_handover_at: string | null; invite_expires_at: string | null;
};

export const ownerStaffFields = "id,display_name,email,status,invited_at,accepted_at,last_handover_at,invite_expires_at";

export const staffContext = cache(async () => {
  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) redirect("/login?next=/staff");
  const [profile, businesses] = await Promise.all([
    db.from("profiles").select("role").eq("id",user.id).maybeSingle(),
    db.rpc("staff_businesses").overrideTypes<StaffBusiness[], { merge: false }>(),
  ]);
  if (profile.data?.role === "owner") redirect("/owner");
  if (profile.data?.role === "admin") redirect("/admin");
  if (businesses.error) throw new Error("Could not load staff access.");
  return { db, user, businesses: Array.isArray(businesses.data) ? businesses.data : [] };
});

export async function hasStaffMembership(db: Awaited<ReturnType<typeof createClient>>, profileId: string) {
  const { data } = await db.from("owner_staff").select("id").eq("profile_id",profileId).limit(1);
  return Boolean(data?.length);
}
