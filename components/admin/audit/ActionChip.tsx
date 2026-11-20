import { actionLabel } from "@/lib/audit/labels";

export function ActionChip({ action, rejected }: { action: string; rejected?: boolean }) {
  const color = rejected || action.endsWith(".deleted") ? "bg-red-50 text-[#C62828]"
    : action.endsWith(".created") ? "bg-green-50 text-[#1E8E5A]"
    : action.endsWith(".status_changed") ? "bg-amber-50 text-[#8a5915]"
    : action.endsWith(".updated") ? "bg-blue-50 text-[#0B63CE]" : "bg-slate-100 text-[#51657F]";
  return <span className={`inline-block rounded-md px-2 py-1 text-xs font-semibold ${color}`}>{actionLabel(action)}</span>;
}
