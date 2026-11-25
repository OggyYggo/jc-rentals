"use client";

import { ScanPickupLink } from "@/components/pickup/ScanPickupLink";
import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, CalendarDays, Check, ScanLine } from "lucide-react";
import { SubmitButton } from "@/components/loading/SubmitButton";
import { createClient } from "@/lib/supabase/client";
import { pickupError, type PickupCredential, type PickupLookup } from "@/lib/pickup/model";
import { paymentDate, paymentPeso } from "@/lib/payment-format";
import "./pickup-success.css";

const actionClass = "inline-flex min-h-11 items-center justify-center rounded-lg border px-3 text-sm font-semibold focus-visible:ring-2 focus-visible:ring-blue-700";

const paymentMethods: Record<string, string> = { cash: "Cash", gcash: "GCash", bank_transfer: "Bank transfer", other: "Other" };
const returnDate = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Manila", month: "short", day: "numeric" });
const savedTime = new Intl.DateTimeFormat("en-PH", { timeZone: "Asia/Manila", hour: "numeric", minute: "2-digit" });
const focusSuccess = (heading: HTMLHeadingElement | null) => {
  if (heading?.getClientRects().length) heading.focus({ preventScroll: true });
};

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
  const [completedAt, setCompletedAt] = useState<Date>();
  const complete = Boolean(completedAt);
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

  if (completedAt && !isReturn && !admin) {
    const initials = lookup.customer_name.trim().split(/\s+/).filter(Boolean).slice(0, 2).map(word => Array.from(word)[0]).join("").toUpperCase();
    const mobileAction = `${actionClass} min-w-0 w-full gap-2 rounded-xl focus-visible:ring-offset-2`;
    const mobileScan = `${mobileAction} border-[#0A47B1] bg-[#0A47B1] text-white hover:bg-[#0A3D91]`;
    const card = "min-w-0 rounded-2xl border border-[#D6E6F7] bg-white p-4";
    const row = "grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] items-start gap-2 py-2.5";

    const scanClass = `${actionClass} gap-2 border-[#2457d6] bg-[#2457d6] text-white hover:bg-[#1d4ed8]`;
    const scanLabel = <><ScanLine size={16} aria-hidden="true" /> Scan another pass</>;

    return <>
    <section aria-labelledby="pickup-success-mobile" className="min-w-0 space-y-3 font-body text-[#0F2342] md:hidden">
      <div role="status" className="px-2 pb-3 pt-4 text-center">
        <span className="mx-auto mb-5 grid size-[88px] place-items-center rounded-full bg-[#12703A] text-white ring-[10px] ring-[#E3F7EA]">
          <span className="t-success-check" data-state="in" aria-hidden="true">
            <Check size={44} strokeWidth={2.7} />
          </span>
        </span>
        <h2 id="pickup-success-mobile" ref={focusSuccess} tabIndex={-1} className="font-heading text-[28px] font-bold leading-tight tracking-tight focus:outline-none">Vehicle handed over</h2>
        <p className="mt-1 text-sm text-[#5B6F89]">Booking is now <strong className="text-[#12703A]">Picked up</strong></p>
      </div>

      <div className={`${card} flex flex-wrap items-center gap-3`}>
        <span aria-hidden="true" className="grid size-11 shrink-0 place-items-center rounded-full bg-[#EAF4FF] font-heading text-sm font-bold text-[#0A47B1]">{initials}</span>
        <div className="min-w-0 flex-1 basis-32">
          <p className="break-words font-heading text-sm font-bold">{lookup.customer_name}</p>
          <p className="break-words text-sm text-[#5B6F89]">{lookup.vehicle_label}{lookup.plate && ` \u00b7 ${lookup.plate}`}</p>
        </div>
        <span className="max-w-full break-all rounded-full bg-[#F3F9FF] px-2.5 py-1 text-xs font-semibold text-[#0A3D91]">{lookup.reference}</span>
      </div>

      <div className={card}>
        <h3 className="font-heading text-sm font-bold">Recorded today</h3>
        <dl className="mt-1 divide-y divide-[#E3EEF9] text-sm">
          <div className={row}><dt className="text-[#5B6F89]">Balance collected</dt><dd className="break-words text-right font-semibold">{due && received ? `${paymentPeso(balance)} \u00b7 ${paymentMethods[method] ?? "Other"}` : "No balance due"}</dd></div>
          {lookup.mode === "self_drive" && lookup.deposit_amount > 0 && <div className={row}>
            <dt className="text-[#5B6F89]">Safety deposit held</dt><dd className="break-words text-right font-semibold">{paymentPeso(lookup.deposit_amount)}</dd>
          </div>}
          <div className={`${row} pb-0`}><dt className="text-[#5B6F89]">ID checked</dt><dd className="flex items-center justify-end gap-1 font-semibold text-[#12703A]"><Check size={16} aria-hidden="true" /> Yes</dd></div>
        </dl>
      </div>

      <div className={`${card} flex items-center gap-3`}>
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-[#EAF4FF] text-[#0A47B1]"><CalendarDays size={19} aria-hidden="true" /></span>
        <div><h3 className="font-heading text-sm font-bold">Return due</h3><p className="mt-0.5 text-sm text-[#5B6F89]">{returnDate.format(new Date(`${lookup.end_date}T00:00:00Z`))}</p></div>
      </div>

      <div className="grid gap-2 pt-1">
        {onCancel ? <button type="button" onClick={onCancel} className={mobileScan}>{scanLabel}</button> : <ScanPickupLink className={mobileScan}>{scanLabel}</ScanPickupLink>}
        <Link href={back} className={`${mobileAction} border-[#D6E6F7] bg-white text-[#0A3D91] hover:bg-[#F3F9FF]`}>View booking</Link>
      </div>
      <p className="text-center text-xs text-[#5B6F89]">Saved {savedTime.format(completedAt)} Manila time</p>
    </section>
    <section aria-labelledby="pickup-success-heading" className="hidden overflow-hidden rounded-2xl border border-emerald-200 bg-white shadow-sm md:block">
      <div role="status" className="bg-emerald-950 px-5 py-8 text-center text-white sm:px-8 sm:py-10">
        <span className="mx-auto mb-4 grid size-16 place-items-center rounded-full bg-emerald-300 text-emerald-950 ring-8 ring-emerald-400/20">
          <Check size={32} strokeWidth={2.5} aria-hidden="true" />
        </span>
        <h2 id="pickup-success-heading" ref={focusSuccess} tabIndex={-1} className="text-2xl font-bold tracking-tight focus:outline-none sm:text-3xl">Vehicle handed over</h2>
        <p className="mt-2 text-sm text-emerald-100">Booking is now <strong>Picked up</strong>.</p>
      </div>

      <div className="space-y-5 p-5 sm:p-6">
        <dl className="space-y-3 rounded-xl bg-slate-50 px-4 py-3 text-sm">
          <div className="grid grid-cols-[5rem_1fr] gap-2">
            <dt className="text-slate-600">Booking</dt>
            <dd className="min-w-0 break-words font-semibold text-slate-900">{lookup.reference}</dd>
          </div>
          <div className="grid grid-cols-[5rem_1fr] gap-2">
            <dt className="text-slate-600">Vehicle</dt>
            <dd className="min-w-0 break-words font-semibold text-slate-900">{lookup.vehicle_label}{lookup.plate && ` · ${lookup.plate}`}</dd>
          </div>
        </dl>

        <div className="grid gap-2 sm:grid-cols-2">
          {onCancel
            ? <button type="button" onClick={onCancel} className={scanClass}>{scanLabel}</button>
            : <ScanPickupLink className={scanClass}>{scanLabel}</ScanPickupLink>}
          <Link href={back} className={`${actionClass} gap-2 border-slate-200 text-slate-700 hover:bg-slate-50`}>
            Back to bookings <ArrowRight size={16} aria-hidden="true" />
          </Link>
        </div>
      </div>
    </section>
    </>;
  }

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
      setCompletedAt(new Date());
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
