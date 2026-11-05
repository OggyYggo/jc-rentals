"use client";

import { useMemo, useState } from "react";
import { Calendar } from "@/components/ui/calendar";

export function AvailabilityCalendar({ today, blockedDates }: { today: string; blockedDates: string[] }) {
  const [selected, setSelected] = useState<Date>();
  const disabled = useMemo(() => [
    { before: new Date(`${today}T00:00:00`) },
    ...blockedDates.map(day => new Date(`${day}T00:00:00`)),
  ], [today, blockedDates]);

  return <div className="theme-public rounded-2xl border border-[#D6E6F7] bg-white p-4"><p className="mb-3 text-xs text-[#51657F]">Unavailable dates are disabled.</p><Calendar mode="single" selected={selected} onSelect={setSelected} disabled={disabled} className="mx-auto"/></div>;
}
