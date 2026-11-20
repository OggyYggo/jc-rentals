"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { actorName, entityLabel, exactTime, historyHref, humanize, recordHref } from "@/lib/audit/labels";
import type { AuditRow } from "@/lib/audit/types";
import { ActionChip } from "./ActionChip";
import { ChangeList } from "./ChangeList";

export function AuditDrawer({ row, close }: { row: AuditRow; close: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [copyStatus, setCopyStatus] = useState("");
  const href = recordHref(row);
  useEffect(() => {
    const node = dialog.current;
    node?.showModal();
    return () => node?.close();
  }, []);

  async function copyId() {
    if (!row.entity_id) return;
    try {
      await navigator.clipboard.writeText(row.entity_id);
      setCopyStatus("Copied");
    } catch {
      setCopyStatus("Copy unavailable");
    }
  }

  return <dialog ref={dialog} aria-label="Audit event details"
    onCancel={event => { event.preventDefault(); close(); }}
    className="fixed inset-y-0 left-auto right-0 m-0 h-dvh max-h-none w-full max-w-none overflow-y-auto bg-white p-5 text-slate-800 backdrop:bg-slate-950/40 sm:w-[34rem]">
    <div className="flex items-start justify-between gap-3">
      <div><ActionChip action={row.action} rejected={row.changes.status?.to === "rejected"}/>
        <p className="mt-2 text-sm">{exactTime(row.created_at)} (Asia/Manila)</p></div>
      <button autoFocus onClick={close} className="rounded-md border px-3 py-2 text-sm">Close</button>
    </div>
    <p className="mt-4 break-words">{row.summary}</p>
    <div className="mt-6 space-y-5 text-sm">
      <section><h2 className="font-semibold">Who</h2>
        <p>{actorName(row)}{row.actor_role === "system" ? (row.actor_label && ` · ${row.actor_label}`) : ` · ${humanize(row.actor_role)}`}</p>
        {row.actor_id && <p className="break-all text-slate-600">{row.actor_id}</p>}
      </section>
      <section><h2 className="font-semibold">Record</h2><p>{entityLabel(row.entity_type)}{row.entity_label && ` · ${row.entity_label}`}</p>
        {row.entity_id && <div className="flex flex-wrap items-center gap-2"><code className="break-all">{row.entity_id}</code>
          <button onClick={copyId} className="rounded border px-2 py-1">Copy ID</button><span role="status">{copyStatus}</span></div>}
        <div className="mt-2 flex flex-wrap gap-3">
          {href && <Link href={href} className="text-blue-800 underline">Open record</Link>}
          {row.entity_id && <Link onClick={close} href={historyHref(row.entity_type, row.entity_id)} className="text-blue-800 underline">View history of this record</Link>}
        </div>
      </section>
      <section><h2 className="mb-2 font-semibold">Changes</h2><ChangeList row={row}/></section>
      {row.reason && <section><h2 className="font-semibold">Reason</h2><p className="whitespace-pre-wrap break-words">{row.reason}</p></section>}
      {Object.keys(row.metadata).length > 0 && <section><h2 className="font-semibold">Metadata</h2>
        <dl>{Object.entries(row.metadata).map(([key, value]) => <div key={key} className="mt-1 grid grid-cols-2 gap-2">
          <dt>{humanize(key)}</dt><dd className="break-words">{value ?? "—"}</dd></div>)}</dl></section>}
      <p className="text-slate-600">Event {row.id}</p>
    </div>
  </dialog>;
}
