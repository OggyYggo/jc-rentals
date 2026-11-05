"use client";

import { useState } from "react";
import type { FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CarFront, LoaderCircle } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

export function AuthForm({ mode, configured, next = "/account/bookings" }: { mode: "login" | "signup"; configured: boolean; next?: string }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [showResendConfirmation, setShowResendConfirmation] = useState(false);
  const isSignup = mode === "signup";

  async function handleEmailAuth(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setMessage("");
    setShowResendConfirmation(false);
    setBusy(true);

    try {
      const supabase = createClient();
      const normalizedEmail = email.trim();
      if (isSignup) {
        const { data, error: authError } = await supabase.auth.signUp({
          email: normalizedEmail,
          password,
          options: {
            data: { full_name: fullName.trim() },
            emailRedirectTo: `${window.location.origin}/auth/callback?next=/account/profile`,
          },
        });
        if (authError) throw authError;
        if (!data.session) {
          setMessage("Check your email to confirm your account, then sign in.");
          setShowResendConfirmation(true);
          return;
        }
      } else {
        const { error: authError } = await supabase.auth.signInWithPassword({ email: normalizedEmail, password });
        if (authError) throw authError;
      }
      let destination = !isSignup && next.startsWith("/") && !next.startsWith("//") ? next : "/account/bookings";
      if (!isSignup) {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
          if (profile?.role === "owner") destination = "/owner";
          if (profile?.role === "admin") destination = "/admin";
        }
      }
      router.replace(destination);
      router.refresh();
    } catch (authError) {
      const authCode = typeof authError === "object" && authError !== null && "code" in authError ? authError.code : undefined;
      if (authCode === "email_not_confirmed") {
        setError("Confirm your email address before signing in. You can resend the confirmation email below.");
        setShowResendConfirmation(true);
      } else {
        setError(authError instanceof Error ? authError.message : "We could not sign you in. Please try again.");
      }
    } finally {
      setBusy(false);
    }
  }

  async function resendConfirmation() {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const supabase = createClient();
      const { error: resendError } = await supabase.auth.resend({
        type: "signup",
        email: email.trim(),
        options: { emailRedirectTo: `${window.location.origin}/auth/callback?next=/account/profile` },
      });
      if (resendError) throw resendError;
      setMessage("A new confirmation email has been sent. Check your inbox and spam folder.");
      setShowResendConfirmation(false);
    } catch (resendError) {
      setError(resendError instanceof Error ? resendError.message : "We could not resend the confirmation email. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function handleGoogle() {
    setError("");
    setBusy(true);
    try {
      const supabase = createClient();
      const { error: authError } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}` },
      });
      if (authError) throw authError;
    } catch (authError) {
      setError(authError instanceof Error ? authError.message : "Google sign-in is unavailable. Please try again.");
      setBusy(false);
    }
  }

  return (
    <div className="w-full max-w-[420px] rounded-2xl border border-[#e5eaf1] bg-white p-6 shadow-[0_24px_70px_-38px_rgba(28,59,119,.28)] sm:p-8">
      <Link href="/" className="mb-8 inline-flex items-center gap-2 text-sm font-semibold text-[#26364e]"><span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#2457d6] text-white"><CarFront size={20} /></span> Kuyog Bohol</Link>
      <h1 className="text-2xl font-semibold tracking-tight text-[#203149]">{isSignup ? "Create your account" : "Welcome back"}</h1>
      <p className="mt-2 text-sm leading-6 text-[#718096]">{isSignup ? "Keep your bookings and rental details together." : "Sign in to manage your rentals and profile."}</p>

      {!configured && <div role="status" className="mt-5 rounded-xl border border-[#f3dfb4] bg-[#fff9eb] p-3 text-xs leading-5 text-[#805a17]">Authentication needs Supabase credentials. Add the values listed in <code>.env.example</code> and apply the customer portal migration.</div>}
      {error && <div role="alert" className="mt-5 rounded-xl border border-[#f3c7c7] bg-[#fff5f5] p-3 text-xs leading-5 text-[#a33232]">{error}</div>}
      {message && <div role="status" className="mt-5 rounded-xl border border-[#cddcfb] bg-[#f4f7ff] p-3 text-xs leading-5 text-[#34528f]">{message}</div>}

      <button type="button" onClick={handleGoogle} disabled={!configured || busy} className="mt-6 flex h-11 w-full items-center justify-center gap-2 rounded-lg border border-[#dfe5ec] bg-white text-sm font-medium text-[#34445b] transition hover:bg-[#f7f9fc] disabled:cursor-not-allowed disabled:opacity-50">
        <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.09-1.92 3.27-4.74 3.27-8.1Z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.65l-3.57-2.77c-.99.66-2.25 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.15v2.84A11 11 0 0 0 12 23Z"/><path fill="#FBBC05" d="M5.84 14.11A6.6 6.6 0 0 1 5.5 12c0-.73.12-1.44.34-2.11V7.05H2.15A11 11 0 0 0 1 12c0 1.78.43 3.46 1.15 4.95l3.69-2.84Z"/><path fill="#EA4335" d="M12 5.36c1.62 0 3.06.56 4.2 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1a11 11 0 0 0-9.85 6.05l3.69 2.84C6.71 7.29 9.14 5.36 12 5.36Z"/></svg>
        Continue with Google
      </button>
      <div className="my-5 flex items-center gap-3 text-[10px] text-[#9aa5b3]"><span className="h-px flex-1 bg-[#e9edf2]"/>OR CONTINUE WITH EMAIL<span className="h-px flex-1 bg-[#e9edf2]"/></div>

      <form onSubmit={handleEmailAuth} className="space-y-4">
        {isSignup && <label className="block text-xs font-medium text-[#43536a]">Full name<input required autoComplete="name" value={fullName} onChange={(event) => setFullName(event.target.value)} className="mt-1.5 h-10 w-full rounded-lg border border-[#dfe5ec] px-3 text-sm text-[#26364e] outline-none transition focus:border-[#6e91e8] focus:ring-3 focus:ring-[#2457d6]/10" placeholder="Your name" /></label>}
        <label className="block text-xs font-medium text-[#43536a]">Email address<input required type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} className="mt-1.5 h-10 w-full rounded-lg border border-[#dfe5ec] px-3 text-sm text-[#26364e] outline-none transition focus:border-[#6e91e8] focus:ring-3 focus:ring-[#2457d6]/10" placeholder="you@example.com" /></label>
        <label className="block text-xs font-medium text-[#43536a]">Password<input required minLength={8} type="password" autoComplete={isSignup ? "new-password" : "current-password"} value={password} onChange={(event) => setPassword(event.target.value)} className="mt-1.5 h-10 w-full rounded-lg border border-[#dfe5ec] px-3 text-sm text-[#26364e] outline-none transition focus:border-[#6e91e8] focus:ring-3 focus:ring-[#2457d6]/10" placeholder="At least 8 characters" /></label>
        <button type="submit" disabled={!configured || busy} className="flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-[#2457d6] text-sm font-semibold text-white transition hover:bg-[#1d4ed8] disabled:cursor-not-allowed disabled:opacity-50">{busy && <LoaderCircle className="animate-spin" size={16}/>} {isSignup ? "Create account" : "Sign in"}</button>
      </form>
      {showResendConfirmation && <button type="button" onClick={resendConfirmation} disabled={!configured || busy || !email.trim()} className="mt-3 flex h-10 w-full items-center justify-center gap-2 rounded-lg border border-[#dbe4fb] bg-[#f7f9ff] text-xs font-semibold text-[#4568bd] hover:bg-[#edf2ff] disabled:cursor-not-allowed disabled:opacity-50">{busy && <LoaderCircle size={14} className="animate-spin"/>}Resend confirmation email</button>}
      <p className="mt-6 text-center text-xs text-[#7d8998]">{isSignup ? "Already have an account?" : "New to Kuyog Bohol?"} <Link href={isSignup ? "/login" : "/signup"} className="font-semibold text-[#2457d6] hover:underline">{isSignup ? "Sign in" : "Create an account"}</Link></p>
    </div>
  );
}
