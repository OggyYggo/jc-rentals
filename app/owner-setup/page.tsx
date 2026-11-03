import Link from "next/link";
import { CircleHelp, ShieldCheck } from "lucide-react";

export default function OwnerSetupPage() {
  return <main className="flex min-h-screen items-center justify-center bg-[#f4f7fc] px-5 py-12"><div className="max-w-xl rounded-2xl border border-[#e3e8ef] bg-white p-7 shadow-sm"><span className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#edf2ff] text-[#2457d6]"><CircleHelp size={20}/></span><h1 className="mt-4 text-xl font-semibold text-[#26364e]">Owner access isn’t set up yet</h1><p className="mt-2 text-sm leading-6 text-[#738197]">An administrator needs to assign your profile the owner role and create your rental business record before you can open the dashboard.</p><div className="mt-5 flex gap-2 rounded-xl bg-[#f6f8fc] p-3.5 text-xs leading-5 text-[#6f7d91]"><ShieldCheck size={15} className="mt-0.5 shrink-0 text-[#5374c6]"/>This setup is performed by an administrator in Supabase. Owners cannot grant themselves dashboard access.</div><Link href="/" className="mt-5 inline-flex text-sm font-semibold text-[#2457d6] hover:underline">Return to Kuyog Bohol</Link></div></main>;
}
