import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";

export const ownerWorkCounts = cache(async (ownerId: string) => {
  const db = await createClient();
  const [deposits, requests] = await Promise.all([
    db.from("bookings").select("id", { count: "exact", head: true }).eq("owner_id", ownerId).eq("status", "payment_review"),
    db.from("bookings").select("id", { count: "exact", head: true }).eq("owner_id", ownerId).eq("status", "pending"),
  ]);
  if (requests.error) console.error("Could not load owner booking request count");
  return { pendingBookings: deposits.count ?? 0, bookingRequests: requests.error ? null : requests.count };
});
