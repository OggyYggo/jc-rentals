import { redirect } from "next/navigation";
import { getOwnerContext } from "@/lib/owner-context";
import { maximumTopup, minimumTopup, quickpayConfig } from "@/lib/payments/quickpay";
import { MobileTopUp } from "@/components/owner/mobile-credits/top-up";
import type { CreditState } from "@/components/owner/credit-state";

export const instant = false;

export default async function TopUpPage() {
  const { owner, supabase } = await getOwnerContext();
  if (owner.fee_mode !== "credits") redirect("/owner/credits");
  const { data, error } = await supabase.rpc("owner_credit_state", { p_owner_id: owner.id }).maybeSingle<CreditState>();
  if (error) throw new Error("Could not load available credits.");
  return <MobileTopUp available={Number(data?.available ?? 0)}
    online={quickpayConfig() ? { minimum: minimumTopup, maximum: maximumTopup } : null} />;
}
