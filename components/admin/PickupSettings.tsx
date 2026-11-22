"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { SubmitButton } from "@/components/loading/SubmitButton";

export function PickupSettings({ early, late, requireDocs }: { early: number; late: number; requireDocs: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ text: string; error: boolean }>();
  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const values = new FormData(event.currentTarget);
    setBusy(true); setMessage(undefined);
    try {
      const { error } = await createClient().rpc("admin_set_pickup_settings", {
        p_early: Number(values.get("early")), p_late: Number(values.get("late")), p_docs: values.has("docs"),
      });
      if (error) throw error;
      setMessage({ text: "Pickup settings saved.", error: false });
      router.refresh();
    } catch { setMessage({ text: "Could not save pickup settings.", error: true }); }
    finally { setBusy(false); }
  }
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
