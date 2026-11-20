import { LockKeyhole } from "lucide-react";
import { columnLabel, formatValue } from "@/lib/audit/labels";
import type { AuditRow } from "@/lib/audit/types";

export function ChangeList({ row, compact = false }: { row: AuditRow; compact?: boolean }) {
  const entries = Object.entries(row.changes);
  if (!entries.length) return <span className="text-slate-500">—</span>;
  if (compact) return <ul className="space-y-1">
    {entries.slice(0, 2).map(([field, change]) => <li key={field}>
      {change.masked
        ? <span className="inline-flex items-center gap-1"><LockKeyhole size={13} aria-hidden/> {columnLabel(field)} changed</span>
        : <>{columnLabel(field)} {formatValue(field, change.from, row)} → {formatValue(field, change.to, row)}</>}
    </li>)}
    {entries.length > 2 && <li className="text-slate-500">+{entries.length - 2} more</li>}
  </ul>;
  return <table className="w-full table-fixed text-left text-sm">
    <thead className="border-b"><tr><th scope="col">Field</th><th scope="col">From</th><th scope="col">To</th></tr></thead>
    <tbody className="divide-y">{entries.map(([field, change]) => <tr key={field}>
      <th scope="row" className="py-2 pr-2 font-medium">{columnLabel(field)}</th>
      {change.masked
        ? <td colSpan={2}><span className="inline-flex items-center gap-1"><LockKeyhole size={14} aria-hidden/> Changed (hidden)</span></td>
        : <><td className="break-words pr-2">{formatValue(field, change.from, row)}</td><td className="break-words">{formatValue(field, change.to, row)}</td></>}
    </tr>)}</tbody>
  </table>;
}
