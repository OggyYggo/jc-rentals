"use server";

import { createClient } from "@/lib/supabase/server";
import { withConnectionDeadline } from "@/lib/connection/request";

export async function markOwnerOnboarding(key: "dismissed" | "tour_seen" | "guide_confirm_deposit") {
  try {
    const db = await createClient();
    const { error } = await withConnectionDeadline(signal => db.rpc("mark_owner_onboarding", { p_key: key }).abortSignal(signal));
    if (error) console.warn("Could not save owner onboarding progress.");
  } catch {
    console.warn("Could not save owner onboarding progress.");
  }
}
