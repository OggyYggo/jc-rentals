"use client";

import { useAutoAnimate } from "@formkit/auto-animate/react";
import { useRouter } from "next/navigation";
import { runWithAlerts } from "@/lib/alerts/run";
import { paymentDate } from "@/lib/payment-format";
import { createClient } from "@/lib/supabase/client";
import { PaymentQueueBadge, PaymentQueueCard, PaymentQueueEmpty } from "@/components/owner/payment-queue-card";

export type Dispute = {
  id: string; booking_id: string; kind: string; message: string; status: string;
  owner_reply: string | null; resolution: string | null; created_at: string;
  booking?: { reference: string } | null;
};

export function DisputeList({ disputes, role }: { disputes: Dispute[]; role: "admin" | "owner" | "customer" }) {
  const router = useRouter();
  const [listRef] = useAutoAnimate<HTMLDivElement>({ duration: 180 });
  function act(dispute: Dispute, upheld: boolean) {
    const owner = role === "owner";
    return runWithAlerts({
      reason: {
        title: owner ? "Reply to this dispute" : upheld ? "Resolve dispute" : "Reject dispute",
        label: owner ? "Note for support" : "Resolution shared with both parties",
        minLength: owner ? 1 : 10, maxLength: owner ? 300 : 500, confirmText: owner ? "Save reply" : "Record decision",
      },
      run: async (reason) => {
        const db = createClient();
        const { error } = owner
          ? await db.rpc("owner_reply_payment_dispute", { p_dispute_id: dispute.id, p_reply: reason })
          : await db.rpc("admin_resolve_payment_dispute", { p_dispute_id: dispute.id, p_upheld: upheld, p_resolution: reason });
        if (error) throw error;
      },
      success: owner ? "Reply saved" : "Decision recorded",
      refresh: router.refresh,
    });
  }
  if (!disputes.length) return role === "customer" ? null : role === "owner" ? <PaymentQueueEmpty>No payment disputes.</PaymentQueueEmpty> : <p className="rounded-xl border bg-white p-5 text-sm">No payment disputes.</p>;
  return <div ref={listRef} className="space-y-3">
    {disputes.map(dispute => {
      const kind = dispute.kind.replaceAll("_", " ");
      const date = `${paymentDate(dispute.created_at)} Manila time`;
      const body = <>
        <p className="whitespace-pre-wrap break-words">{dispute.message}</p>
        {role !== "customer" && dispute.owner_reply && <p className="whitespace-pre-wrap break-words">Owner reply · {dispute.owner_reply}</p>}
        {dispute.resolution && <p className="whitespace-pre-wrap break-words">Resolution · {dispute.resolution}</p>}
        {dispute.status === "open" && role !== "customer" && <div className="flex flex-wrap gap-3">
          <button type="button" className="min-h-11 rounded-lg border px-3 font-semibold text-blue-800" onClick={() => act(dispute, true)}>
            {role === "owner" ? "Reply" : "Resolve dispute"}
          </button>
          {role === "admin" && <button type="button" className="min-h-11 rounded-lg border px-3 text-red-800" onClick={() => act(dispute, false)}>Reject dispute</button>}
        </div>}
      </>;
      if (role === "owner") return <PaymentQueueCard key={dispute.id} title={dispute.booking?.reference ?? dispute.booking_id}
        badge={<PaymentQueueBadge label={dispute.status.charAt(0).toUpperCase() + dispute.status.slice(1)} tone={dispute.status === "open" ? "amber" : "neutral"} />}
        detail={<><span className="capitalize">{kind}</span><span>{date}</span></>} action={dispute.status === "open" ? "Read and reply" : "View dispute"}>
        <div className="space-y-3 text-sm leading-6 text-[#405775]">{body}</div>
      </PaymentQueueCard>;
      return <article key={dispute.id} className="space-y-2 rounded-xl border bg-white p-4 text-sm">
        {dispute.booking?.reference && <p className="font-semibold">{dispute.booking.reference}</p>}
        <h2 className="font-semibold capitalize">{kind} · {dispute.status}</h2>
        <p className="text-slate-600">{date}</p>
        {body}
      </article>;
    })}
  </div>;
}
