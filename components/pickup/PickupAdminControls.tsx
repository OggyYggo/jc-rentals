"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { pickupScanToken, requestPickupLookup } from "@/lib/pickup/client";
import { pickupError, type PickupLookup } from "@/lib/pickup/model";
import { PickupCheck } from "./PickupCheck";
import { SubmitButton } from "@/components/loading/SubmitButton";

export function PickupAdminControls({ id, origins, canReset }: { id: string; origins: string[]; canReset: boolean }) {
  const router = useRouter();
  const [input, setInput] = useState("");
  const [reason, setReason] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ lookup: PickupLookup; token: string }>();

  if (result) return <PickupCheck lookup={result.lookup} credential={{ token: result.token }} admin onCancel={() => {
    setInput(""); setResult(undefined);
  }} />;

  async function check(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    setError(""); setMessage("");
    const token = pickupScanToken(input, origins);
    if (!token) { setError("Paste a valid Kuyog Bohol pickup link."); return; }
    setBusy(true);
    try {
      const lookup = await requestPickupLookup({ token });
      if (!("booking_id" in lookup) || lookup.booking_id !== id) { setError("This pass is unavailable for the current booking."); return; }
      setResult({ lookup, token });
    } catch { setError("Could not check the pickup pass."); }
    finally { setBusy(false); }
  }

  async function reset(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    setError(""); setMessage(""); setBusy(true);
    try {
      const { error } = await createClient().rpc("admin_reset_pickup_pass", { p_booking: id, p_reason: reason });
      if (error) throw error;
      setMessage("Pickup pass reset. The customer can open the replacement from their booking.");
      setReason("");
      router.refresh();
    } catch (error) { setError(pickupError(error)); }
    finally { setBusy(false); }
  }

  return <div className="space-y-3">
    {canReset && <>
      <form onSubmit={reset} className="space-y-2 rounded-xl border bg-white p-4 text-sm">
        <h2 className="font-semibold">Reset pickup pass</h2>
        <p>The current QR and backup code will stop working.</p>
        <label className="block">Reason<textarea className="mt-1 block w-full rounded border p-2" value={reason}
          onChange={event => setReason(event.target.value)} minLength={5} maxLength={200} required /></label>
        <SubmitButton busy={busy} disabled={reason.trim().length < 5} pendingText="Resetting…">Reset pass</SubmitButton>
      </form>
      <form onSubmit={check} className="space-y-2 rounded-xl border bg-white p-4 text-sm">
        <h2 className="font-semibold">Confirm on behalf of the owner</h2>
        <label className="block">Pickup link<input className="mt-1 block w-full rounded border p-2" type="url" value={input}
          onChange={event => setInput(event.target.value)} autoComplete="off" required/></label>
        <SubmitButton busy={busy} pendingText="Checking…">Review handover</SubmitButton>
      </form>
    </>}
    {message && <p role="status" className="text-sm text-emerald-800">{message}</p>}
    {error && <p role="alert" className="text-sm text-red-800">{error}</p>}
  </div>;
}
