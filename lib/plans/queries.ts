import { createClient } from "@supabase/supabase-js";
import type { PricingPlan } from "@/lib/plans/breakEven";

/** Public plan reads use the anon key without touching a visitor's auth cookies. */
export async function getPublicPlans(): Promise<{ plans: PricingPlan[]; unavailable: boolean }> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return { plans: [], unavailable: true };

  const supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const { data, error } = await supabase
    .from("plans")
    .select("id,code,name,tagline,price_php,max_active_vehicles,commission_rate,support_level,features,is_featured,sort_order")
    .eq("is_public", true)
    .eq("is_active", true)
    .order("sort_order");

  if (error) return { plans: [], unavailable: true };
  return { plans: (data ?? []) as unknown as PricingPlan[], unavailable: false };
}
