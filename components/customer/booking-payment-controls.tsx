"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { SubmitButton } from "@/components/loading/SubmitButton";
import { cancelWithPreview } from "@/lib/cancellation-dialog";

export function PaymentCountdown({ deadline, now }: { deadline: string; now: number }) {
  const [current, setCurrent] = useState(now);
  useEffect(() => {
    const timer = window.setInterval(() => setCurrent(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  const remaining = Math.max(0, Math.ceil((Date.parse(deadline) - current) / 1000));
  const hours = Math.floor(remaining / 3600);
  const minutes = Math.floor(remaining / 60) % 60;
  const seconds = remaining % 60;
  return <p className="text-sm tabular-nums">{remaining ? `${hours}h ${minutes}m ${seconds}s left` : "Payment window closed"}</p>;
}

export function CancelBookingButton({ id, reference }: { id: string; reference: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const inFlight = useRef(false);
  async function cancel() {
    if (inFlight.current) return;
    inFlight.current = true;
    setPending(true);
    try {
      await cancelWithPreview({ booking: { id, reference }, customer: true, refresh: router.refresh, setPending: () => {} });
    } finally {
      inFlight.current = false;
      setPending(false);
    }
  }
  return <SubmitButton unstyled type="button" busy={pending} pendingText="Cancelling…" onClick={cancel}
    className="mt-4 h-[52px] w-full rounded-full border border-[#A12A2A] text-sm font-semibold text-[#A12A2A] md:hidden">
    Cancel booking
  </SubmitButton>;
}
