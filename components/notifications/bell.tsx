"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Bell as BellIcon } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

type Notification = { id: string; title: string; body: string | null; url: string | null; read_at: string | null; created_at: string };

export function NotificationBell({ userId }: { userId: string }) {
  const [items, setItems] = useState<Notification[]>([]);
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: PointerEvent) {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);
  useEffect(() => {
    const db = createClient();
    void db.from("notifications").select("id,title,body,url,read_at,created_at").eq("user_id", userId).order("created_at", { ascending: false }).limit(20).then(({ data }) => setItems((data ?? []) as Notification[]));
    const channel = db.channel(`notifications:${userId}`).on("postgres_changes", { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${userId}` }, ({ new: row }) => setItems((current) => [row as Notification, ...current].slice(0, 20))).subscribe();
    return () => { void db.removeChannel(channel); };
  }, [userId]);
  const unread = items.filter((item) => !item.read_at).length;
  async function select(item: Notification) {
    if (!item.read_at) {
      await createClient().rpc("mark_notifications_read", { p_ids: [item.id] });
      setItems((current) => current.map((entry) => entry.id === item.id ? { ...entry, read_at: new Date().toISOString() } : entry));
    }
    if (item.url) window.location.assign(item.url);
  }
  async function markAll() {
    await createClient().rpc("mark_notifications_read", { p_ids: null });
    setItems((current) => current.map((item) => ({ ...item, read_at: item.read_at ?? new Date().toISOString() })));
  }
  return <div ref={rootRef} className="relative">
    <button aria-label={`Notifications${unread ? `, ${unread} unread` : ""}`} onClick={() => setOpen((value) => !value)} className="relative flex h-9 w-9 items-center justify-center rounded-lg text-[#65738a] hover:bg-[#f5f7fb]"><BellIcon size={17}/>{unread > 0 && <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[9px] font-semibold text-white">{unread > 9 ? "9+" : unread}</span>}</button>
    {open && <div className="fixed inset-x-3 top-[76px] z-50 max-h-[calc(100dvh-6rem)] overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-xl sm:absolute sm:inset-x-auto sm:right-0 sm:top-11 sm:max-h-none sm:w-[min(22rem,calc(100vw-2rem))] sm:overflow-hidden"><div className="flex items-center justify-between border-b px-4 py-3"><span className="text-sm font-semibold">Notifications</span><button onClick={markAll} className="text-xs text-blue-700">Mark all read</button></div><div className="max-h-80 overflow-auto">{items.map((item) => <button key={item.id} onClick={() => void select(item)} className={`block w-full border-b px-4 py-3 text-left hover:bg-slate-50 ${item.read_at ? "" : "bg-blue-50/70"}`}><span className="flex items-start gap-2"><span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${item.read_at ? "bg-transparent" : "bg-blue-600"}`}/><span><span className="block text-sm font-medium">{item.title}</span>{item.body && <span className="mt-1 block text-xs text-slate-600">{item.body}</span>}<time className="mt-1 block text-[10px] text-slate-400">{new Date(item.created_at).toLocaleString()}</time></span></span></button>)}{!items.length && <p className="p-5 text-center text-sm text-slate-500">You’re all caught up.</p>}</div><Link onClick={() => setOpen(false)} href="/notifications" className="block p-3 text-center text-xs font-medium text-blue-700">View all notifications</Link></div>}
  </div>;
}
