"use client";

import { useState } from "react";
import { cancellationRule, formatCutoff, refundMoney, refundOwnerCopy } from "@/lib/cancellation";

export function ListingCancellation({ start, hours, percent, pickupHour, reservation, withDriver }: {
  start?: string; hours: number; percent: number; pickupHour: number; reservation: number; withDriver?: boolean;
}) {
  const [pickup, setPickup] = useState("");
  const time = withDriver ? pickup : `${String(pickupHour).padStart(2, "0")}:00`;
  const deadline = start && time ? new Date(Date.parse(`${start}T${time}:00+08:00`) - hours * 3_600_000) : null;
  const fee = Math.round(reservation * percent) / 100;
  return <div className="space-y-2 text-sm">
    {withDriver && <label className="block text-xs font-semibold">Pickup time<input required name="pickup_time" type="time" value={pickup}
      onChange={event => setPickup(event.target.value)} className="mt-1 h-11 w-full rounded-xl border border-[#D6E6F7] px-3 text-sm font-normal"/></label>}
    <p>{deadline ? `Free cancellation until ${formatCutoff(deadline.toISOString())}` : `Free cancellation until ${hours} hours before pickup`}</p>
    <details>
      <summary className="cursor-pointer font-semibold">Cancellation policy</summary>
      <p className="mt-2">{cancellationRule(hours, percent)} If the owner cancels, the verified reservation payment is refunded in full.</p>
      {reservation > 0 && <p className="mt-1">On an estimated reservation payment of {refundMoney(reservation)}, a late cancellation would keep {refundMoney(fee)} and refund {refundMoney(reservation - fee)}.</p>}
      <p className="mt-1">{refundOwnerCopy}</p>
    </details>
  </div>;
}
