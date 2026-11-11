import { Suspense, type ReactNode } from "react";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { AccountShell } from "@/components/customer/account-shell";
import { SupabaseSetupNotice } from "@/components/customer/setup-notice";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/shared";

async function CustomerAccountContent({ children }: { children: ReactNode }) {
  if (!isSupabaseConfigured()) return <main className="min-h-[calc(100vh-68px)] bg-[#f5f7fb] px-5 py-16"><SupabaseSetupNotice /></main>;
  await connection();
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (profile?.role === "admin") redirect("/admin");
  if (profile?.role === "owner") redirect("/owner");
  return <AccountShell userId={user.id} email={user.email ?? "Customer account"}>{children}</AccountShell>;
}

function AccountLoading() {
  return <main className="min-h-[calc(100vh-68px)] bg-[#f5f7fb] px-5 py-10"><div className="mx-auto max-w-6xl"><div className="mb-6 h-8 w-52 animate-pulse rounded bg-white"/><div className="h-80 animate-pulse rounded-2xl border border-[#e3e8ef] bg-white"/></div></main>;
}

export default function CustomerAccountLayout({ children }: { children: ReactNode }) {
  return <Suspense fallback={<AccountLoading/>}><CustomerAccountContent>{children}</CustomerAccountContent></Suspense>;
}
