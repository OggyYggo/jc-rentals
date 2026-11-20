import Link from "next/link";
import { actorName, exactTime, relativeTime } from "@/lib/audit/labels";
import type { AuditRow } from "@/lib/audit/types";

export function ActivityList({ entries, now }: { entries: AuditRow[]; now: number }) {
  if (!entries.length) return <p className="text-slate-600">No activity yet.</p>;
  return <ul className="divide-y divide-slate-100">
    {entries.map(row => <li key={row.id} className="py-2">
      <p className="break-words">{row.summary}</p>
      <p className="text-xs text-slate-600">{actorName(row)}{row.actor_role === "system" && row.actor_label ? ` · ${row.actor_label}` : ""} ·{" "}
        <time dateTime={row.created_at} title={exactTime(row.created_at)}>{now ? relativeTime(row.created_at, now) : exactTime(row.created_at)}</time></p>
    </li>)}
  </ul>;
}

export function RecentActivity({ entries, now }: { entries: AuditRow[] | null; now: number }) {
  if (!entries) return null;
  return <section className="mt-5 rounded-xl border border-slate-200 bg-white p-4 text-sm">
    <div className="mb-2 flex flex-wrap justify-between gap-2">
      <h2 className="font-semibold">Recent activity</h2>
      <Link href="/admin/audit-log" className="text-blue-800 underline">View audit log</Link>
    </div>
    <ActivityList entries={entries} now={now}/>
  </section>;
}
