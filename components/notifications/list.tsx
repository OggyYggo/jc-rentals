"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Item = { id: string; title: string; body: string | null; url: string | null; read_at: string | null; created_at: string };
export function NotificationList({ items }: { items: Item[] }) {
  const [rows, setRows] = useState(items);
  async function open(item: Item) {
    if (!item.read_at) {
      const { error } = await createClient().rpc("mark_notifications_read", { p_ids: [item.id] });
      if (error) return;
      setRows((current) => current.map((row) => row.id === item.id ? { ...row, read_at: new Date().toISOString() } : row));
    }
    if (item.url) window.location.assign(item.url);
  }
  return <div className="mt-6 divide-y overflow-hidden rounded-xl border bg-white">{rows.map((item) => <button key={item.id} onClick={() => void open(item)} className={`block w-full p-4 text-left hover:bg-slate-50 ${item.read_at ? "" : "bg-blue-50"}`}><p className="font-medium text-slate-900">{item.title}</p>{item.body && <p className="mt-1 text-sm text-slate-600">{item.body}</p>}<time className="mt-2 block text-xs text-slate-400">{new Date(item.created_at).toLocaleString()}</time></button>)}{!rows.length && <p className="p-8 text-center text-sm text-slate-500">No notifications yet.</p>}</div>;
}
