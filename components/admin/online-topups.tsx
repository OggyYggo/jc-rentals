import Link from "next/link";
import { exactTime } from "@/lib/audit/labels";
import { paymentPeso } from "@/lib/payment-format";

export type OnlineTopupRow = {
  order_id: string;
  owner_id: string;
  amount: number;
  method: string | null;
  status: string;
  needs_review: boolean;
  created_at: string;
  provider: string;
  livemode: boolean;
  owner: { business_name: string } | null;
};

const statuses: Record<string, string> = { created: "Created", paid: "Paid", failed: "Failed", expired: "Expired", needs_review: "Needs review" };
const methods: Record<string, string> = { gcash: "GCash", maya: "Maya", gotyme: "GoTyme", grabpay: "GrabPay", shopeepay: "ShopeePay", qrph: "QR Ph", banks: "Banks" };

export function onlineTopupStatus(row: OnlineTopupRow) {
  return row.needs_review ? "needs_review" : row.status;
}

export function onlineTopupLabels(row: OnlineTopupRow) {
  const status = onlineTopupStatus(row);
  return { status: statuses[status] ?? status, method: row.method ? (methods[row.method.toLowerCase()] ?? row.method) : "—",
    provider: row.provider === "quickpay" ? "QuickPay" : "BayadGate" };
}

export function AdminOnlineTopups({ rows, available }: { rows: OnlineTopupRow[]; available: boolean }) {
  return <section className="mt-6 rounded-xl border bg-white p-4">
    <h2 className="font-semibold">Online top-ups</h2>
    {!available && <p className="mt-2 text-sm text-slate-600">Could not load online top-ups.</p>}
    {available && !rows.length && <p className="mt-2 text-sm text-slate-600">No online top-ups yet.</p>}
    <ul className="divide-y">
      {rows.map(row => {
        const status = row.needs_review ? "needs_review" : row.status;
        return <li key={row.order_id} className="py-3 text-sm">
          <div className="grid grid-cols-2 gap-2 lg:grid-cols-6">
            <span className="font-medium">{row.order_id}{!row.livemode && <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-xs">Test</span>}</span>
            <Link href={`/admin/owners/${row.owner_id}`} className="break-words text-blue-800 underline">
              {row.owner?.business_name ?? row.owner_id}
            </Link>
            <span>{paymentPeso(row.amount)}</span>
            <span>{row.method ? (methods[row.method.toLowerCase()] ?? row.method) : "—"}</span>
            <span className={row.needs_review ? "font-semibold text-amber-800" : ""}>
              {statuses[status]}
            </span>
            <time dateTime={row.created_at} className="text-slate-600">{exactTime(row.created_at)}</time>
          </div>
          {row.needs_review && <p className="mt-2 text-slate-600">
            Check the {row.provider === "quickpay" ? "QuickPay" : "BayadGate"} dashboard. If the payment arrived and credits are still owed, use Adjust credits on the owner page.
          </p>}
        </li>;
      })}
    </ul>
  </section>;
}
