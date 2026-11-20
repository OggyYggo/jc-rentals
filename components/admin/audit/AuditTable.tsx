"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { actorName, entityLabel, exactTime, humanize, recordHref, relativeTime } from "@/lib/audit/labels";
import type { AuditRow } from "@/lib/audit/types";
import { ActionChip } from "./ActionChip";
import { AuditDrawer } from "./AuditDrawer";
import { ChangeList } from "./ChangeList";

const headers = ["When", "Who", "What", "Record", "Details", "Reason"];
const cell = "block min-w-0 break-words px-3 py-1 lg:table-cell lg:py-3";

export function AuditTable({ rows, now }: { rows: AuditRow[]; now: number }) {
  const [selected, setSelected] = useState<AuditRow | null>(null);
  const focused = useRef<HTMLElement>(null);
  function open(row: AuditRow, target: HTMLElement) {
    focused.current = target;
    setSelected(row);
  }
  function close() {
    setSelected(null);
    requestAnimationFrame(() => focused.current?.focus());
  }
  return <>
    <table className="block w-full table-fixed text-left text-sm lg:table">
      <thead className="sr-only lg:not-sr-only"><tr>{headers.map((header, i) =>
        <th key={header} scope="col" className={`px-3 py-2 ${i === 2 ? "w-1/4" : ""}`}>{header}</th>)}</tr></thead>
      <tbody className="block space-y-3 lg:table-row-group lg:divide-y lg:space-y-0">
        {rows.map(row => {
          const href = recordHref(row);
          const name = row.entity_label || entityLabel(row.entity_type);
          return <tr key={row.id} tabIndex={0} onClick={event => {
            if (!(event.target as HTMLElement).closest("a,button")) open(row, event.currentTarget);
          }} onKeyDown={event => {
            if (event.key === "Enter" && !(event.target as HTMLElement).closest("a,button")) {
              event.preventDefault();
              open(row, event.currentTarget);
            }
          }} className="block cursor-pointer rounded-lg border border-slate-200 bg-white py-2 align-top hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-blue-700 lg:table-row lg:rounded-none lg:border-0">
            <td className={cell}><button onClick={event => open(row, event.currentTarget)} className="group relative text-left text-blue-800 underline" aria-label={`View event ${row.id}, ${exactTime(row.created_at)} Manila time`}>
              <time dateTime={row.created_at}>{relativeTime(row.created_at, now)}</time>
              <span className="pointer-events-none absolute top-full left-0 z-10 hidden w-max max-w-52 rounded bg-slate-900 p-2 text-white group-hover:block group-focus-visible:block">{exactTime(row.created_at)} PHT</span>
            </button></td>
            <td className={cell}><span className="font-medium">{actorName(row)}</span> {row.actor_role !== "system" && <span className="rounded bg-slate-100 px-1.5 text-xs">{humanize(row.actor_role)}</span>}
              {row.actor_role === "system" && <p className="text-xs text-slate-600">{row.actor_label}</p>}</td>
            <td className={cell}><ActionChip action={row.action} rejected={row.changes.status?.to === "rejected"}/><p className="mt-1 line-clamp-2">{row.summary}</p></td>
            <td className={cell}><span className="mr-2 font-semibold lg:hidden">Record</span>{href ? <Link href={href} className="text-blue-800 underline">{name}</Link> : name}</td>
            <td className={cell}><span className="font-semibold lg:hidden">Details</span><ChangeList row={row} compact/></td>
            <td className={cell}><span className="font-semibold lg:hidden">Reason</span><span className="line-clamp-2">{row.reason ?? "—"}</span></td>
          </tr>;
        })}
      </tbody>
    </table>
    {selected && <AuditDrawer key={selected.id} row={selected} close={close}/>}
  </>;
}
