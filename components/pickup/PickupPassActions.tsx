"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { runWithAlerts } from "@/lib/alerts/run";
import { toastSuccess } from "@/lib/alerts/toast";
import type { PickupPass } from "@/lib/pickup/model";

export function PickupPassActions({ bookingId, state, rotations = 0 }: {
  bookingId: string; state: PickupPass["state"]; rotations?: number;
}) {
  const router = useRouter();
  const last = useRef(state);

  useEffect(() => {
    if ((state === "used" || state === "return_ready") && (last.current === "ready" || last.current === "today")) void toastSuccess("Pickup confirmed");
    last.current = state;
    if (state !== "ready" && state !== "today" && state !== "not_ready" && state !== "return_ready") return;
    const refresh = () => { if (document.visibilityState === "visible") router.refresh(); };
    const timer = window.setInterval(refresh, 20_000);
    document.addEventListener("visibilitychange", refresh);
    return () => { clearInterval(timer); document.removeEventListener("visibilitychange", refresh); };
  }, [router, state]);

  if (state !== "ready" && state !== "today") return null;
  return <button type="button" disabled={rotations >= 3} className="min-h-11 text-sm font-semibold text-blue-800 underline disabled:opacity-50" onClick={() => void runWithAlerts({
    confirm: { title: "Replace this pickup pass?", text: "The QR and backup code on any saved images will stop working.", confirmText: "Replace pass" },
    run: async () => {
      const { error } = await createClient().rpc("rotate_my_pickup_pass", { p_booking: bookingId });
      if (error) throw error;
    },
    refresh: router.refresh,
    success: "Pickup pass replaced",
  })}>{rotations >= 3 ? "Replacement limit reached" : "I think my pass was shared"}</button>;
}
