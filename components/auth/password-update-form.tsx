"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

const fieldClass = "mt-1.5 h-11 w-full rounded-lg border border-[#dfe5ec] bg-white px-3 text-sm text-[#26364e] outline-none focus:border-[#6e91e8]";

export function PasswordUpdateForm({ mode }: { mode: "owner" | "reset" }) {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    void Promise.resolve().then(() => createClient().auth.getUser()).then(({ data, error: authError }) => {
      if (!active) return;
      if (authError || !data.user) setError("This password link is invalid or has expired. Request a new one and try again.");
      else setReady(true);
    }).catch(() => {
      if (active) setError("This password link is invalid or has expired. Request a new one and try again.");
    });
    return () => { active = false; };
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setMessage("");
    if (password.length < 8) return setError("Use at least 8 characters for your password.");
    if (password !== confirm) return setError("The passwords do not match.");
    setBusy(true);
    try {
      const { error: updateError } = await createClient().auth.updateUser({ password });
      if (updateError) return setError(updateError.message);
    } catch {
      return setError("We could not update your password. The link may have expired; request a new one and try again.");
    } finally {
      setBusy(false);
    }
    if (mode === "owner") {
      setMessage("Your password is set. Taking you to your owner dashboard…");
      router.replace("/owner");
      router.refresh();
    } else {
      setMessage("Your password has been updated. You can now sign in.");
      window.setTimeout(() => router.replace("/login?password=updated"), 900);
    }
  }

  return <form onSubmit={submit} className="space-y-4 rounded-2xl border border-[#e5eaf1] bg-white p-6 shadow-sm sm:p-8">
    {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800">{error}</p>}
    {message && <p role="status" className="rounded-lg bg-blue-50 p-3 text-sm text-blue-900">{message}</p>}
    <label className="block text-xs font-medium text-[#53637a]">New password<input required minLength={8} type="password" autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} className={fieldClass}/></label>
    <label className="block text-xs font-medium text-[#53637a]">Confirm new password<input required minLength={8} type="password" autoComplete="new-password" value={confirm} onChange={(event) => setConfirm(event.target.value)} className={fieldClass}/></label>
    <button disabled={!ready || busy} className="h-11 w-full rounded-lg bg-[#2457d6] px-5 text-sm font-semibold text-white disabled:opacity-50">{busy ? "Saving…" : mode === "owner" ? "Set password and continue" : "Update password"}</button>
  </form>;
}
