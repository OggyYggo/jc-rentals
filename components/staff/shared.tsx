import { Check, X } from "lucide-react";
import { staffStatuses } from "@/lib/staff/content";

export const staffCard = "min-w-0 rounded-2xl border border-[#D6E6F7] bg-white p-4 text-sm text-[#0F2342] sm:p-5";
export const staffAction = "inline-flex min-h-11 items-center justify-center rounded-xl border border-[#D6E6F7] px-3 text-sm font-semibold text-[#0A3D91] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0A47B1] disabled:opacity-50";
export const staffPrimary = `${staffAction} border-[#0A47B1] bg-[#0A47B1] text-white hover:bg-[#0A3D91]`;
export const staffInput = "mt-1 min-h-11 w-full rounded-lg border border-[#D6E6F7] px-3 text-sm focus-visible:outline-2 focus-visible:outline-[#0A47B1]";

export function StaffChip({ status }: { status: keyof typeof staffStatuses }) {
  const { label, tone } = staffStatuses[status];
  return <span className={`shrink-0 rounded-full px-2.5 py-1 text-[13px] font-semibold ${tone}`}>{label}</span>;
}

export function StaffRules({ items, restricted = false }: { items: string[]; restricted?: boolean }) {
  const Icon = restricted ? X : Check;
  return <ul className="space-y-2 text-sm text-[#0F2342]">
    {items.map(item => <li key={item} className="flex gap-2">
      <Icon size={18} className={`mt-0.5 shrink-0 ${restricted ? "text-[#A12A2A]" : "text-[#12703A]"}`} aria-hidden />
      <span>{item}</span>
    </li>)}
  </ul>;
}
