import { PageHeading, formatPeso } from "@/components/owner/ui";
import { getOwnerContext } from "@/lib/owner-context";
import { OwnerCredits } from "@/components/owner/credits";
export const instant = false;
export default async function OwnerCreditsPage() {
 const { supabase, owner } = await getOwnerContext();
 const [{ data: ledger }, { data: balances }, { data: settings }] = await Promise.all([
   supabase.from("owner_credit_ledger").select("id,type,amount,status,reference_no,proof_path,note,created_at").eq("owner_id", owner.id).order("created_at", { ascending: false }),
   supabase.from("owner_credit_balances").select("balance").eq("owner_id", owner.id).maybeSingle(),
   supabase.from("settings").select("key,value").in("key", ["platform_account_name","platform_qr_path","min_credit_to_list"]),
 ]);
 const values = new Map((settings ?? []).map(x => [x.key, x.value]));
 let qrUrl: string | null = null; const path = String(values.get("platform_qr_path") ?? "");
 if (path) { const { data } = await supabase.storage.from("platform-qr").createSignedUrl(path, 300); qrUrl = data?.signedUrl ?? null; }
 return <><PageHeading eyebrow="Payments" title="Credits" description="Platform fees are paid from your credit balance. Top-ups are reviewed by an administrator."/><OwnerCredits ownerId={owner.id} rows={(ledger ?? []) as never} balance={Number(balances?.balance ?? 0)} minimum={Number(values.get("min_credit_to_list") ?? 500)} accountName={String(values.get("platform_account_name") ?? "") } qrUrl={qrUrl}/></>;
}
