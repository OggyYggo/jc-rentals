import { paymentDate, paymentPeso } from "@/lib/payment-format";

export type RiskPayment = {
  id: string; proof_path: string | null; proof_sha256: string | null; flags: string[];
  paid_at: string; amount: number; status: string; booking: { reference: string; payment_flags: string[] } | null;
  owner: { business_name: string } | null;
};

export function PaymentRisk({ rows, urls, matchedIds }: { rows: RiskPayment[]; urls: Record<string, string>; matchedIds: string[] }) {
  const groups = new Map<string, RiskPayment[]>();
  for (const row of rows) {
    const key = row.proof_sha256 && row.flags.includes("duplicate_proof") ? row.proof_sha256 : row.id;
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }
  if (!rows.length) return <p className="rounded-xl border bg-white p-5 text-sm">No flagged payments match these filters.</p>;
  return <div className="space-y-4">{Array.from(groups, ([key, group]) => <section key={key} className="grid gap-4 rounded-xl border bg-white p-4 sm:grid-cols-2">
    {group.map((row) => <article key={row.id} className="min-w-0 space-y-2 text-sm">
      <h2 className="break-words font-semibold">{row.booking?.reference ?? row.id} · {row.owner?.business_name ?? "Rental business"}</h2>
      {matchedIds.length > 0 && !matchedIds.includes(row.id) && <p className="text-slate-600">Matching proof from another payment</p>}
      <p className="capitalize">{row.status} · {paymentPeso(row.amount)} · {paymentDate(row.paid_at)}</p>
      <div className="flex flex-wrap gap-2">
        {[...new Set([...row.flags, ...(row.booking?.payment_flags ?? [])])].map(flag =>
          <span key={flag} className="rounded-full bg-amber-100 px-2 py-1 text-xs text-amber-950">{flag.replaceAll("_", " ")}</span>)}
      </div>
      {urls[row.id] && <a href={urls[row.id]} target="_blank" rel="noreferrer">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={urls[row.id]} alt={`Payment proof for ${row.booking?.reference ?? "booking"}`} className="mt-3 max-h-64 max-w-full rounded object-contain" />
      </a>}
    </article>)}
  </section>)}</div>;
}
