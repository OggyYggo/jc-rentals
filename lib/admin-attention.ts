import { cache } from "react";
import type { getAdminContext } from "@/lib/admin-context";

type AdminClient = Awaited<ReturnType<typeof getAdminContext>>["supabase"];

export const loadAdminAttention = cache(async (db: AdminClient) => {
  const options = { count: "exact", head: true } as const;
  const requests = {
    deposits: db.from("payments").select("id", options).eq("status", "pending"),
    applications: db.from("owner_applications").select("id", options).eq("status", "pending"),
    documents: db.from("profiles").select("id", options).eq("role", "customer").eq("verification", "pending"),
    topups: db.from("owner_credit_ledger").select("id", options).eq("type", "topup").eq("status", "pending"),
    plans: db.from("plan_payments").select("id", options).eq("status", "pending"),
    reviews: db.from("review_reports").select("id", options).eq("status", "open"),
  };
  const entries = await Promise.all(Object.entries(requests).map(async ([key, request]) => {
    const result = await request;
    if (result.error) console.error("Could not load admin attention count", key);
    return [key, result.error ? null : result.count] as const;
  }));
  return Object.fromEntries(entries) as Record<keyof typeof requests, number | null>;
});

export type AdminAttention = Awaited<ReturnType<typeof loadAdminAttention>>;
