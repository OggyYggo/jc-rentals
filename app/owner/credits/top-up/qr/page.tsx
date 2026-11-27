import { redirect } from "next/navigation";
import { getOwnerContext } from "@/lib/owner-context";
import { MobileQrTopUp } from "@/components/owner/mobile-credits/top-up";
import { loadPlatformQr } from "../../platform-qr";

export const instant = false;

export default async function TopUpQrPage({ searchParams }: PageProps<"/owner/credits/top-up/qr">) {
  const { owner, supabase } = await getOwnerContext();
  if (owner.fee_mode !== "credits") redirect("/owner/credits");
  const { amount } = await searchParams;
  const parsed = typeof amount === "string" ? Number(amount) : 0;
  const { data, error } = await supabase.from("owner_payment_settings").select("key,value")
    .in("key", ["platform_account_name", "platform_qr_path"]);
  if (error) throw new Error("Could not load the payment QR.");
  const qr = await loadPlatformQr(supabase, new Map((data ?? []).map(row => [row.key, row.value])));
  return <MobileQrTopUp ownerId={owner.id} amount={Number.isFinite(parsed) && parsed > 0 ? parsed : null} {...qr} />;
}
