"use client";

import { staffAction, staffCard } from "@/components/staff/shared";

export default function StaffError({ reset }: { reset: () => void }) {
  return <main className={`${staffCard} mx-auto my-5 max-w-lg space-y-3`}>
    <h1 className="font-heading text-lg font-bold">Could not load handover staff</h1>
    <button className={staffAction} type="button" onClick={reset}>Try again</button>
  </main>;
}
