"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { SubmitButton } from "@/components/loading/SubmitButton";
import { MobileSettingsEditor } from "./mobile-settings-editor";

export function PickupSettings({ early, late, requireDocs, mobile = false }: { early: number; late: number; requireDocs: boolean; mobile?: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ text: string; error: boolean }>();
  async function persist(nextEarly: number, nextLate: number, nextDocs: boolean) {
    if (busy) return false;
    setBusy(true); setMessage(undefined);
    try {
      const { error } = await createClient().rpc("admin_set_pickup_settings", {
        p_early: nextEarly, p_late: nextLate, p_docs: nextDocs,
      });
      if (error) throw error;
      setMessage({ text: "Pickup settings saved.", error: false });
      router.refresh();
      return true;
    } catch { setMessage({ text: "Could not save pickup settings.", error: true }); return false; }
    finally { setBusy(false); }
  }
  function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    void persist(Number(values.get("early")), Number(values.get("late")), values.has("docs"));
  }
  if (mobile) return <>
    <MobileSettingsEditor busy={busy} initial={{ early: String(early), late: String(late), docs: requireDocs }}
      fields={[
        { key: "early", label: "Days before pickup", type: "number", unit: "days", min: 0, max: 3, required: true, description: "How early a pickup pass becomes valid." },
        { key: "late", label: "Days after rental ends", type: "number", unit: "days", min: 0, max: 3, required: true, description: "How long the pass stays valid after the rental ends." },
        { key: "docs", label: "Require verified documents for self-drive pickups", type: "switch" },
      ]} onSave={values => persist(Number(values.early), Number(values.late), Boolean(values.docs))} />
    {message && <p role={message.error ? "alert" : "status"} className="mt-3 text-sm">{message.text}</p>}
  </>;
  return <form onSubmit={save} className="my-4 max-w-xl space-y-3 rounded-xl border bg-white p-4 text-sm">
    <h2 className="font-semibold">Pickup passes</h2>
    <div className="grid gap-3 sm:grid-cols-2">
      <label>Days before pickup<input name="early" type="number" className="mt-1 block w-full rounded border p-2" min={0} max={3} defaultValue={early} required/></label>
      <label>Days after rental ends<input name="late" type="number" className="mt-1 block w-full rounded border p-2" min={0} max={3} defaultValue={late} required/></label>
    </div>
    <label className="flex min-h-11 items-center gap-2"><input name="docs" type="checkbox" defaultChecked={requireDocs}/> Require verified documents for self-drive pickups</label>
    <SubmitButton busy={busy} pendingText="Saving…">Save pickup settings</SubmitButton>
    {message && <p role={message.error ? "alert" : "status"}>{message.text}</p>}
  </form>;
}
