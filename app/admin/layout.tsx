import "./mobile.css";
import { Suspense, type ReactNode } from "react";
import { loadAdminAttention } from "@/lib/admin-attention";
import { AdminShell } from "@/components/admin/admin-shell";
import { getAdminContext } from "@/lib/admin-context";

export const metadata = { robots: { index: false, follow: false } };

export const instant = false;

async function AdminLayoutContent({ children }: { children: ReactNode }) {
  const { user, profile, supabase } = await getAdminContext();
  const attention = await loadAdminAttention(supabase);
  return <AdminShell attention={attention} userId={user.id} email={user.email ?? "Admin"} fullName={profile?.full_name ?? ""}>{children}</AdminShell>;
}

function AdminLoading() {
  return <div className="min-h-screen bg-[#f4f7fc] lg:pl-[250px]"><div className="h-[68px] border-b border-[#e8edf4] bg-white"/><main className="mx-auto max-w-[1440px] px-4 py-8 sm:px-7"><div className="mb-6 h-16 motion-safe:animate-pulse rounded-xl bg-white"/><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{[1, 2, 3, 4].map(item => <div key={item} className="h-32 motion-safe:animate-pulse rounded-xl border border-[#e7ecf3] bg-white"/>)}</div><div className="mt-5 h-80 motion-safe:animate-pulse rounded-xl border border-[#e7ecf3] bg-white"/></main></div>;
}

export default function AdminLayout({ children }: { children: ReactNode }) {
  return <Suspense fallback={<AdminLoading/>}><AdminLayoutContent>{children}</AdminLayoutContent></Suspense>;
}
