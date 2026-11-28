import "server-only";

import { getOwnerContext } from "@/lib/owner-context";
import { ownerPaymentOptions } from "@/lib/payments/qr";
import { createAdminClient } from "@/lib/supabase/admin";
import type { CreditState } from "@/components/owner/credit-state";
import { hasSetupVehicle, hasStartingCredits, qrChecklistState } from "./checklist";

type Context = Awaited<ReturnType<typeof getOwnerContext>>;
type History = {
  archived_at: string | null;
  payment_qr_path: string | null;
  payment_qr_verified: boolean;
  onboarding_dismissed_at: string | null;
  onboarding_tour_seen_at: string | null;
  guide_confirm_deposit_seen_at: string | null;
};

export async function readMinimum({ supabase }: Context) {
  const { data, error } = await supabase.from("owner_payment_settings").select("value").eq("key", "min_credit_to_list").maybeSingle();
  if (error) { console.warn("Could not read onboarding credit minimum."); return null; }
  return Number(data?.value ?? 500);
}

export async function readReviewHours() {
  const result = await createAdminClient()?.from("settings").select("value").eq("key", "payment_review_hours").maybeSingle();
  if (!result || result.error) { console.warn("Could not read onboarding review window."); return null; }
  return Number(result.data?.value ?? 12);
}

export async function readOwnerOnboarding(context: Context) {
  const { supabase, owner } = context;
  const { data: history, error } = await supabase.from("owners")
    .select("archived_at,payment_qr_path,payment_qr_verified,onboarding_dismissed_at,onboarding_tour_seen_at,guide_confirm_deposit_seen_at")
    .eq("id", owner.id).maybeSingle<History>();
  if (error) console.warn("Could not read owner onboarding history.");
  if (history?.archived_at || history?.onboarding_dismissed_at) return null;

  const [options, cars, credit, minimum, readiness, claims, reviewHours] = await Promise.all([
    ownerPaymentOptions(supabase, owner.id).returns<{ qr_path: string; verified: boolean; rejection_reason: string | null }[]>(),
    supabase.from("cars").select("is_active,car_photos(id),car_rates(daily_rate)").eq("owner_id", owner.id),
    owner.fee_mode === "invoice" ? null : supabase.rpc("owner_credit_state", { p_owner_id: owner.id }).maybeSingle<CreditState>(),
    readMinimum(context),
    supabase.rpc("owner_can_accept", { p_owner_id: owner.id }),
    supabase.auth.getClaims(),
    history && !history.onboarding_tour_seen_at ? readReviewHours() : null,
  ]);
  if (options.error) console.warn("Could not read onboarding payment options.");
  if (cars.error) console.warn("Could not read onboarding vehicles.");
  if (credit?.error) console.warn("Could not read onboarding credit balance.");
  if (readiness.error) console.warn("Could not read onboarding listing readiness.");

  return {
    ownerId: owner.id,
    sessionId: typeof claims.data?.claims.session_id === "string" ? claims.data.claims.session_id : null,
    currentOwner: owner.is_active,
    qr: options.error ? null : qrChecklistState(options.data ?? [], history),
    vehicle: cars.error ? null : hasSetupVehicle(cars.data ?? []),
    credits: hasStartingCredits(owner.fee_mode === "invoice", credit?.data ? Number(credit.data.available) : null, minimum),
    guide: history ? Boolean(history.guide_confirm_deposit_seen_at) : null,
    canList: !readiness.error && readiness.data === true && hasSetupVehicle(cars.data ?? [], true),
    completionEnabled: Boolean(history),
    tour: Boolean(history && !history.onboarding_tour_seen_at),
    invoice: owner.fee_mode === "invoice",
    minimum,
    reviewHours,
  };
}
