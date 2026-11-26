import Link from "next/link";
import { exactTime } from "@/lib/audit/labels";
import { expiryCutoff } from "@/lib/payments/bayadgate";
import { paymentPeso } from "@/lib/payment-format";

export type OnlineTopupRow = {
  order_id: string;
  owner_id: string;
  amount: number;
  method: string | null;
  status: string;
  needs_review: boolean;
  created_at: string;
  owner: { business_name: string } | null;
};

const statuses: Record<string, string> = { created: "Created", paid: "Paid", failed: "Failed", expired: "Expired" };
const methods: Record<string, string> = { GCASH: "GCash", MAYA: "Maya", GOTYME: "GoTyme" };

export function AdminOnlineTopups({ rows, available }: { rows: OnlineTopupRow[]; available: boolean }) {
  const cutoff = Date.parse(expiryCutoff());
  return <section className="mt-6 rounded-xl border bg-white p-4">
    <h2 className="font-semibold">Online top-ups</h2>
    {!available && <p className="mt-2 text-sm text-slate-600">Could not load online top-ups.</p>}
    {available && !rows.length && <p className="mt-2 text-sm text-slate-600">No online top-ups yet.</p>}
    <ul className="divide-y">
      {rows.map(row => {
        const status = row.status === "created" && Date.parse(row.created_at) <= cutoff ? "expired" : row.status;
        return <li key={row.order_id} className="py-3 text-sm">
          <div className="grid grid-cols-2 gap-2 lg:grid-cols-6">
            <span className="font-medium">{row.order_id}</span>
            <Link href={`/admin/owners/${row.owner_id}`} className="break-words text-blue-800 underline">
              {row.owner?.business_name ?? row.owner_id}
            </Link>
            <span>{paymentPeso(row.amount)}</span>
            <span>{row.method ? methods[row.method] : "—"}</span>
            <span className={row.needs_review ? "font-semibold text-amber-800" : ""}>
              {row.needs_review ? `Needs review · ${statuses[status]}` : statuses[status]}
            </span>
            <time dateTime={row.created_at} className="text-slate-600">{exactTime(row.created_at)}</time>
          </div>
          {row.needs_review && <p className="mt-2 text-slate-600">
            Check the BayadGate dashboard. {status === "created"
              ? "If the payment arrived, wait until the order closes before arranging a manual credit adjustment."
              : "If the payment arrived, arrange a manual credit adjustment."}
          </p>}
        </li>;
      })}
    </ul>
  </section>;
}
