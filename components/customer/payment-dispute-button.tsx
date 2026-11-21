"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { runWithAlerts } from "@/lib/alerts/run";
import { createClient } from "@/lib/supabase/client";

const kinds = {
  paid_not_confirmed: "I paid but it is not confirmed",
  refund_not_received: "Not received",
  wrong_amount: "Report a wrong amount",
  other: "Report a payment issue",
};

export function PaymentDisputeButton({ bookingId, kind, availableAt }: {
  bookingId: string; kind: keyof typeof kinds; availableAt?: string;
}) {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  useEffect(() => {
    if (!availableAt) return;
    const timer = window.setTimeout(() => setReady(true), Math.max(0, Date.parse(availableAt) - Date.now()));
    return () => window.clearTimeout(timer);
  }, [availableAt]);
  if (availableAt && !ready) return null;

  function openDispute() {
    return runWithAlerts({
      reason: {
        title: kind === "refund_not_received" ? "Report a missing refund" : "Ask support to review this payment",
        label: "Tell us what happened", minLength: 10, maxLength: 1000, confirmText: "Submit dispute",
      },
      run: async (message) => {
        const { error } = await createClient().rpc("open_payment_dispute", {
          p_booking: bookingId, p_kind: kind, p_message: message,
        });
        if (error) throw error;
      },
      success: "Dispute submitted",
      refresh: router.refresh,
    });
  }
  return <button type="button" onClick={openDispute} className="min-h-11 text-sm font-semibold text-blue-800 underline">{kinds[kind]}</button>;
}
