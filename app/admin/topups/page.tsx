import { AdminHeading } from "@/components/admin/ui";
import { AdminTopupReview } from "@/components/admin/payment-admin";
import { getAdminContext } from "@/lib/admin-context";
export const instant = false;
export default async function AdminTopupsPage(){const {supabase}=await getAdminContext();const {data,error}=await supabase.from("owner_credit_ledger").select("id,owner_id,amount,reference_no,proof_path,created_at,owner:owners(business_name)").eq("type","topup").eq("status","pending").order("created_at");if(error)throw new Error("Could not load top-up reviews.");return <><AdminHeading eyebrow="Payments" title="Owner top-ups" description="Verify incoming platform payments before adding credits."/><AdminTopupReview rows={(data??[]) as never}/></>}
