"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

import { PasswordField } from "./password-field";
import { SubmitButton } from "@/components/loading/SubmitButton";
import { passwordRules, validatePassword, type PasswordIdentity } from "@/lib/auth/password-policy";

export function PasswordUpdateForm({ mode }: { mode: "owner" | "reset" }) {
  const router = useRouter();
  const [identity, setIdentity] = useState<PasswordIdentity>();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const failures = validatePassword(password, identity);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    void Promise.resolve().then(async () => {
      const client = createClient();
      const { data, error: authError } = await client.auth.getUser();
      if (!active) return;
      if (authError || !data.user) setError("This password link is invalid or has expired. Request a new one and try again.");
      else {
        const metadata = data.user.user_metadata;
        const fullName = typeof metadata.full_name === "string" ? metadata.full_name : typeof metadata.name === "string" ? metadata.name : undefined;
        const { data: profile } = await client.from("profiles").select("full_name").eq("id", data.user.id).maybeSingle();
        if (active) setIdentity({ email: data.user.email, fullName: profile?.full_name || fullName });
      }
    }).catch(() => {
      if (active) setError("This password link is invalid or has expired. Request a new one and try again.");
    });
    return () => { active = false; };
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!identity || busy || message) return;
    setError("");
    if (failures.length) return setError(passwordRules[failures[0]]);
    if (password !== confirm) return setError("The passwords do not match.");
    setBusy(true);
    try {
      const { error: updateError } = await createClient().auth.updateUser({ password });
      if (updateError) return setError(updateError.code === "weak_password"
        ? "Choose a different password that meets all the requirements."
        : "We could not update your password. Request a fresh link and try again.");
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
    <PasswordField label="New password" value={password} onChange={setPassword} failures={failures} disabled={busy || Boolean(message)} />
    <PasswordField label="Confirm new password" value={confirm} onChange={setConfirm} mismatch={Boolean(confirm) && password !== confirm} disabled={busy || Boolean(message)} />
    <SubmitButton unstyled busy={busy} pendingText="Saving password..." disabled={!identity || failures.length > 0 || password !== confirm || Boolean(message)}
      className="h-11 w-full rounded-lg bg-[#2457d6] px-5 text-sm font-semibold text-white disabled:opacity-50">
      {mode === "owner" ? "Set password and continue" : "Update password"}
    </SubmitButton>
  </form>;
}
