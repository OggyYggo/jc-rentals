import { redirect } from "next/navigation";
import { connection } from "next/server";
import { AccountShell } from "@/components/customer/account-shell";
import { SupabaseSetupNotice } from "@/components/customer/setup-notice";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/shared";

export default async function CustomerAccountLayout({ children }: LayoutProps<"/account">) {
  if (!isSupabaseConfigured()) return <main className="min-h-[calc(100vh-68px)] bg-[#f5f7fb] px-5 py-16"><SupabaseSetupNotice /></main>;
  await connection();
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (profile?.role === "admin") redirect("/admin");
  if (profile?.role === "owner") redirect("/owner");
  return <AccountShell email={user.email ?? "Customer account"}>{children}</AccountShell>;
}
