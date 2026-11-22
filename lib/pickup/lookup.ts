import "server-only";
import { createHmac } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import type { createClient } from "@/lib/supabase/server";
import type { PickupCredential, PickupLookup } from "./model";

export async function lookupPickup(db: Awaited<ReturnType<typeof createClient>>, headers: Headers, credential: PickupCredential): Promise<PickupLookup> {
  const admin = createAdminClient();
  const secret = process.env.SUPABASE_SECRET_KEY;
  if (!admin || !secret) throw new Error("Pickup lookup unavailable");
  const ip = headers.get("x-vercel-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const caller = createHmac("sha256", secret).update(`pickup:${ip}`).digest("hex");
  const limit = await admin.rpc("take_pickup_request", { p_caller: caller });
  if (limit.error) throw new Error("Pickup lookup unavailable");
  if (!limit.data) return { result: "LOCKED", retry_after_seconds: 60 };
  const { data, error } = await db.rpc("owner_lookup_pickup_pass", {
    p_token: credential.token ?? null, p_code: credential.code ?? null,
  });
  if (error) throw new Error("Pickup lookup unavailable");
  return data as PickupLookup;
}
