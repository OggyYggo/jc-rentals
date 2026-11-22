"use client";

import { ScanPickupLink } from "@/components/pickup/ScanPickupLink";
import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { SubmitButton } from "@/components/loading/SubmitButton";
import { createClient } from "@/lib/supabase/client";
import { pickupError, type PickupCredential, type PickupLookup } from "@/lib/pickup/model";
import { paymentDate, paymentPeso } from "@/lib/payment-format";

const actionClass = "inline-flex min-h-11 items-center justify-center rounded-lg border px-3 text-sm font-semibold focus-visible:ring-2 focus-visible:ring-blue-700";

export function PickupCheck({ lookup, credential, admin = false, onCancel }: {
  lookup: PickupLookup; credential: PickupCredential; admin?: boolean; onCancel?: () => void;
}) {
  const router = useRouter();
  const [idChecked, setIdChecked] = useState(false);
  const [received, setReceived] = useState(false);
  const [method, setMethod] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const active = useRef(false);
  const [complete, setComplete] = useState(false);
  const [error, setError] = useState("");
  const back = admin && "booking_id" in lookup ? `/admin/bookings/${lookup.booking_id}/pickup` : "/owner/bookings";
  const cancel = onCancel
    ? <button type="button" className={actionClass} disabled={busy} onClick={onCancel}>Cancel</button>
    : <Link className={actionClass} href={back}>Back to bookings</Link>;

  if (!("booking_id" in lookup)) {
    const text = lookup.result === "ALREADY_USED"
      ? `This pass was already used${lookup.used_at ? ` on ${paymentDate(lookup.used_at)} Manila time` : ""}.`
      : lookup.result === "LOCKED" ? `Too many attempts. Try again in ${Math.ceil(lookup.retry_after_seconds / 60)} minute(s).`
      : "This is a Kuyog Bohol pickup pass. Only the vehicle owner can use it in the app.";
    return <div className="space-y-4"><p role="status" className="rounded-xl bg-red-50 p-4 text-sm font-medium text-red-950">{text}</p>{cancel}</div>;
  }

  const isReturn = lookup.stage === "return";
  const balance = Number(lookup.balance_at_pickup);
  const due = !isReturn && balance > 0;
  const needsReason = !isReturn && (admin || lookup.result === "NOT_TODAY");
  const blocked = !isReturn && !admin && lookup.docs_required && !lookup.documents_verified;
  const canSubmit = isReturn ? !admin : !blocked && idChecked && (!due || (received && method !== "")) && (!needsReason || reason.trim().length >= 5);

  if (complete) return <section className="space-y-4 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-950" role="status">
    <h2 className="font-semibold">{isReturn ? "Return confirmed. Booking is now Returned." : "Handed over. Booking is now Picked up."}</h2>
    <div className="flex flex-wrap gap-2">
      {!admin && (onCancel ? <button type="button" onClick={onCancel} className={actionClass}>Scan another</button> : <ScanPickupLink className={actionClass}>Scan another</ScanPickupLink>)}
      <Link href={back} className={actionClass}>{admin ? "Back to pickup details" : "Back to bookings"}</Link>
    </div>
  </section>;

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!("booking_id" in lookup) || !canSubmit || active.current) return;
    active.current = true;
    setBusy(true);
    setError("");
    try {
      const params = { p_booking: lookup.booking_id, p_token: credential.token ?? null };
      const db = createClient();
      const { error } = isReturn
        ? await db.rpc("owner_confirm_return", { ...params, p_notes: reason || null })
        : await db.rpc("owner_confirm_pickup", {
          ...params, p_code: credential.code ?? null, p_id_checked: idChecked,
          p_balance_received: received, p_balance_method: method || null, p_override_reason: reason || null,
        });
      if (error) throw error;
      setComplete(true);
      if (onCancel) router.refresh();
    } catch (error) {
      setError(pickupError(error));
    } finally {
      active.current = false;
      setBusy(false);
    }
  }

  return <section className="space-y-3">
    <p role="status" className={`rounded-xl p-3 text-sm font-semibold ${blocked ? "bg-blue-50 text-blue-950" :
      lookup.result === "NOT_TODAY" ? "bg-amber-50 text-amber-950" : "bg-emerald-50 text-emerald-950"}`}>
      {blocked ? pickupError({ message: "DOCS_NOT_VERIFIED" }) :
        lookup.result === "NOT_TODAY" ? `Outside the pickup window. The booking starts on ${lookup.start_date}.` :
        isReturn ? "Valid return pass" : "Valid pass"}
    </p>
    <dl className={`grid gap-2 rounded-xl border bg-white p-4 text-sm sm:grid-cols-2 ${onCancel ? "grid-cols-2 max-lg:px-3" : ""}`}>
      <div><dt className="text-slate-600">Customer</dt><dd className="break-words font-semibold">{lookup.customer_name}</dd></div>
      <div><dt className="text-slate-600">Vehicle</dt><dd className="break-words font-semibold">{lookup.vehicle_label}{lookup.plate && ` · ${lookup.plate}`}</dd></div>
      <div><dt className="text-slate-600">Rental dates</dt><dd>{lookup.start_date} to {lookup.end_date}</dd></div>
      <div><dt className="text-slate-600">Booking</dt><dd className="break-words">{lookup.reference} · {lookup.mode === "self_drive" ? "Self-drive" : "With driver"}</dd></div>
      {lookup.mode === "self_drive" && lookup.deposit_amount > 0 && <div><dt className="text-slate-600">Refundable safety deposit</dt><dd>{paymentPeso(lookup.deposit_amount)}</dd></div>}
    </dl>
    {!isReturn && <dl className="grid grid-cols-2 gap-2 rounded-xl border bg-white p-4 text-sm">
      {[["Reservation deposit", "Paid"], ["License", lookup.license_ok ? "Verified" : "Unverified"],
        ["Government ID", lookup.id_ok ? "Verified" : "Unverified"], ["Pickup date", lookup.pickup_today ? "Today" : lookup.start_date]].map(([label,value]) =>
        <div key={label}><dt className="text-slate-600">{label}</dt><dd className="font-semibold">{value}</dd></div>)}
    </dl>}
    <form onSubmit={submit} aria-busy={busy} className="space-y-3">
      {due && <fieldset className="space-y-2 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm">
        <legend className="px-1 font-semibold text-amber-950">Balance due · {paymentPeso(balance)}</legend>
        <label className="block">Paid by<select className="mt-1 block min-h-11 w-full rounded-lg border bg-white px-2" value={method} onChange={event => setMethod(event.target.value)}>
          <option value="">Select payment method</option><option value="cash">Cash</option><option value="gcash">GCash</option>
          <option value="bank_transfer">Bank transfer</option><option value="other">Other</option>
        </select></label>
        <label className="flex min-h-11 items-center gap-2 font-medium"><input type="checkbox" checked={received} onChange={event => setReceived(event.target.checked)} /> I received {paymentPeso(balance)}</label>
      </fieldset>}
      {!isReturn && <label className="flex min-h-11 items-center gap-2 rounded-xl border bg-white p-3 text-sm">
        <input type="checkbox" checked={idChecked} onChange={event => setIdChecked(event.target.checked)} />
        I checked the customer’s ID matches this booking
      </label>}
      {(needsReason || isReturn) && <label className="block text-sm font-medium">
        {isReturn ? "Return notes (optional)" : admin ? "Admin override reason" : "Reason for the agreed early or late handover"}
        <textarea rows={2} maxLength={200} className="mt-1 block w-full rounded-lg border bg-white p-2" value={reason} onChange={event => setReason(event.target.value)} />
      </label>}
      {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-950">{error}</p>}
      <div className={`flex flex-wrap gap-2 ${onCancel ? "max-lg:grid max-lg:grid-cols-[1fr_auto]" : ""}`}>
        <SubmitButton unstyled busy={busy} disabled={!canSubmit} pendingText="Confirming…" className={`${actionClass} bg-blue-700 text-white disabled:opacity-50`}>
          {isReturn ? "Confirm return" : "Confirm handover"}
        </SubmitButton>{cancel}
      </div>
    </form>
  </section>;
}
