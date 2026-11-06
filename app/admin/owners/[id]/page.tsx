import { notFound } from "next/navigation";
import { AdminHeading } from "@/components/admin/ui";
import { getAdminContext } from "@/lib/admin-context";
import { AdminOwnerPaymentTerms } from "@/components/admin/owner-payment-terms";
export const instant=false;
export default async function AdminOwnerPaymentPage({params}:{params:Promise<{id:string}>}){const {id}=await params;const {supabase}=await getAdminContext();const {data:owner}=await supabase.from("owners").select("id,business_name,fee_mode,commission_rate,deposit_percent,payment_method_label,payment_account_name,payment_qr_path,payment_qr_verified").eq("id",id).maybeSingle();if(!owner)notFound();let qrUrl:string|null=null;if(owner.payment_qr_path){const {data}=await supabase.storage.from("owner-qr").createSignedUrl(owner.payment_qr_path,300);qrUrl=data?.signedUrl??null;}return <><AdminHeading eyebrow="Owners" title={owner.business_name} description="Review the payment account and configure platform fees and booking deposits."/><AdminOwnerPaymentTerms owner={owner as never} qrUrl={qrUrl}/></>}
