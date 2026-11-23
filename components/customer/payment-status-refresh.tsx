"use client";

import { useEffect, useRef, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toastSuccess } from "@/lib/alerts/toast";

export function PaymentStatusRefresh({ status }: { status: string }) {
  const router = useRouter();
  const previous = useRef(status);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (previous.current !== status && status === "confirmed") void toastSuccess("Payment confirmed");
    previous.current = status;
  }, [status]);

  useEffect(() => {
    if (!["payment_review", "awaiting_payment", "pending"].includes(status)) return;
    function refresh() {
      if (document.visibilityState === "visible" && !pending && navigator.onLine) startTransition(() => router.refresh());
    }
    const timer = window.setInterval(refresh, 15000);
    document.addEventListener("visibilitychange", refresh);
    window.addEventListener("online", refresh);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", refresh);
      window.removeEventListener("online", refresh);
    };
  }, [status, pending, router]);
  return null;
}
