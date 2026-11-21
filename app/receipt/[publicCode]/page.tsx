import { createHmac } from "node:crypto";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { paymentDate, paymentPeso } from "@/lib/payment-format";
import { receiptStatuses, type Receipt } from "@/lib/payment-receipt";
import { createAdminClient } from "@/lib/supabase/admin";

export const instant = false;
export const metadata = { title: "Booking Payment Confirmation", robots: { index: false, follow: false } };

export default async function VerifyConfirmation({ params }: { params: Promise<{ publicCode: string }> }) {
  const { publicCode } = await params;
  if (!/^[0-9a-f]{32}$/.test(publicCode)) notFound();
  const db = createAdminClient();
  const secret = process.env.SUPABASE_SECRET_KEY;
  if (!db || !secret) throw new Error("Payment verification is unavailable.");
  const requestHeaders = await headers();
  const ip = requestHeaders.get("x-vercel-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const caller = createHmac("sha256", secret).update(ip).digest("hex");
  const { data: allowed, error: limitError } = await db.rpc("take_payment_request", { p_scope: "receipt", p_caller: caller });
  if (limitError) throw new Error("Payment verification is unavailable.");
  if (!allowed) return <main className="mx-auto max-w-lg p-6">Too many verification requests. Try again in a minute.</main>;
  const { data, error } = await db.rpc("public_payment_confirmation", { p_code: publicCode }).maybeSingle<{
    receipt_no: string; status: Receipt["status"]; created_at: string; amount: number; vehicle: string; owner_name: string;
  }>();
  if (error) throw new Error("Payment verification is unavailable.");
  if (!data) notFound();
  return <main className="mx-auto max-w-lg p-6">
    <h1 className="text-2xl font-bold">Booking Payment Confirmation</h1>
    <dl className="mt-5 grid gap-3 rounded-xl border bg-white p-5 text-sm">
      {[
        ["Confirmation number", data.receipt_no], ["Status", receiptStatuses[data.status]],
        ["Paid amount", paymentPeso(data.amount)], ["Date (Manila)", paymentDate(data.created_at)],
        ["Vehicle", data.vehicle], ["Rental business", data.owner_name],
      ].map(([label, value]) => <div key={label}><dt className="font-semibold">{label}</dt><dd>{value}</dd></div>)}
    </dl>
  </main>;
}
