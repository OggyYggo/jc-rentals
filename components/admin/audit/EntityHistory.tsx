"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { loadEntityHistory } from "@/lib/audit/actions";
import { historyHref } from "@/lib/audit/labels";
import type { AuditRow, Entity } from "@/lib/audit/types";
import { ActivityList } from "./RecentActivity";

export function EntityHistory({ entity, id }: { entity: Entity; id: string }) {
  const [result, setResult] = useState<AuditRow[] | null>();
  const [now, setNow] = useState(0);
  const [pending, startTransition] = useTransition();
  function refresh() {
    setNow(Date.now());
    startTransition(async () => {
      try {
        setResult(await loadEntityHistory(entity, id));
      } catch {
        setResult(null);
      }
    });
  }
  return <details className="mt-2 rounded-lg border border-slate-200 bg-white p-2 text-sm"
    onToggle={event => { if (event.currentTarget.open) refresh(); }}>
    <summary className="cursor-pointer font-semibold text-slate-800">History</summary>
    <div className="mt-2 min-w-0 break-words">
      {pending || result === undefined ? <p role="status">Loading history…</p>
        : result === null ? <p>Could not load history. <button onClick={refresh} className="underline">Try again</button></p>
        : <ActivityList entries={result} now={now}/>}
      <Link href={historyHref(entity, id)} className="mt-2 inline-block text-blue-800 underline">View all</Link>
    </div>
  </details>;
}
