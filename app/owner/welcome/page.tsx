import Link from "next/link";
import { CheckCircle2, Circle } from "lucide-react";
import { PasswordUpdateForm } from "@/components/auth/password-update-form";
import { getOwnerContext } from "@/lib/owner-context";

export default async function OwnerWelcomePage() {
  const { owner } = await getOwnerContext();
  return <main className="min-h-screen bg-[#f5f8fc] px-5 py-12 text-[#26364e] sm:px-8"><div className="mx-auto max-w-xl">
    <p className="text-xs font-semibold uppercase tracking-wide text-[#2457d6]">Application approved</p>
    <h1 className="mt-2 text-3xl font-semibold">Welcome, {owner.business_name}</h1>
    <p className="mt-3 text-sm leading-6 text-[#68778c]">Set a password to finish setting up your owner account.</p>
    <div className="my-6 space-y-3 rounded-xl border border-[#e1e7ef] bg-white p-5 text-sm">
      <p className="flex items-center gap-2"><CheckCircle2 size={17} className="text-green-700"/>Email verified and application approved</p>
      <p className="flex items-center gap-2"><Circle size={17} className="text-[#8793a3]"/>Top up credits before accepting bookings</p>
      <p className="flex items-center gap-2"><Circle size={17} className="text-[#8793a3]"/>Your car stays hidden until final review and publication</p>
    </div>
    <PasswordUpdateForm mode="owner"/>
    <p className="mt-4 text-center text-xs text-[#718096]">You can review your balance in <Link href="/owner/credits" className="font-semibold text-[#2457d6] hover:underline">Credits</Link>.</p>
  </div></main>;
}
