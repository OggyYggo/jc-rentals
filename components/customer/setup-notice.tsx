import Link from "next/link";
import { Settings2 } from "lucide-react";

export function SupabaseSetupNotice() {
  return (
    <div className="mx-auto max-w-xl rounded-2xl border border-[#dce5f5] bg-white p-7 text-center shadow-sm">
      <span className="mx-auto flex h-11 w-11 items-center justify-center rounded-xl bg-[#edf2ff] text-[#2457d6]"><Settings2 size={20} /></span>
      <h1 className="mt-4 text-xl font-semibold text-[#203149]">Connect Supabase to continue</h1>
      <p className="mt-2 text-sm leading-6 text-[#718096]">Add your project URL and publishable key to <code>.env.local</code>, then apply the SQL migration in <code>supabase/migrations</code>.</p>
      <Link href="/" className="mt-5 inline-flex text-sm font-semibold text-[#2457d6] hover:underline">Back to home</Link>
    </div>
  );
}
