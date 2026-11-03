import Link from "next/link";
import { ShieldCheck } from "lucide-react";

export default function AdminSetupPage() {
  return <main className="flex min-h-screen items-center justify-center bg-[#f4f7fc] px-5 py-12"><div className="max-w-xl rounded-2xl border border-[#e3e8ef] bg-white p-7 shadow-sm"><span className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#edf2ff] text-[#2457d6]"><ShieldCheck size={20}/></span><h1 className="mt-4 text-xl font-semibold text-[#26364e]">Administrator access isn’t set up yet</h1><p className="mt-2 text-sm leading-6 text-[#738197]">Configure Supabase and use an administrator account to open the platform console. Admin roles are assigned by an administrator in Supabase.</p><Link href="/" className="mt-5 inline-flex text-sm font-semibold text-[#2457d6] hover:underline">Return to JC Rentals</Link></div></main>;
}
