"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CalendarDays, CarFront, CircleUserRound, LogOut } from "lucide-react";

export function AccountShell({ children, email }: { children: React.ReactNode; email: string }) {
  const pathname = usePathname();
  const active = pathname.startsWith("/account/profile") ? "profile" : "bookings";
  return (
    <main className="min-h-[calc(100vh-68px)] bg-[#f5f7fb] px-4 py-8 sm:px-7 sm:py-10">
      <div className="mx-auto max-w-6xl">
        <div className="mb-7"><p className="text-xs font-medium text-[#6f83a5]">Customer account</p><h1 className="mt-1 text-2xl font-semibold tracking-tight text-[#203149]">Your rentals, all in one place</h1></div>
        <div className="grid gap-5 lg:grid-cols-[230px_minmax(0,1fr)]">
          <aside className="h-fit rounded-2xl border border-[#e3e8ef] bg-white p-3 shadow-sm">
            <div className="flex items-center gap-3 border-b border-[#edf0f4] px-2 pb-4 pt-2"><span className="flex h-9 w-9 items-center justify-center rounded-full bg-[#edf2ff] text-[#2457d6]"><CircleUserRound size={18} /></span><div className="min-w-0"><p className="truncate text-xs font-semibold text-[#34445b]">{email}</p><p className="mt-0.5 text-[10px] text-[#8b97a7]">Customer</p></div></div>
            <nav className="mt-3 space-y-1">
              <Link href="/account/bookings" className={`flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-xs font-medium ${active === "bookings" ? "bg-[#edf2ff] text-[#2457d6]" : "text-[#68778c] hover:bg-[#f6f8fb]"}`}><CalendarDays size={15} /> My bookings</Link>
              <Link href="/account/profile" className={`flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-xs font-medium ${active === "profile" ? "bg-[#edf2ff] text-[#2457d6]" : "text-[#68778c] hover:bg-[#f6f8fb]"}`}><CircleUserRound size={15} /> Profile &amp; documents</Link>
              <Link href="/cars" className="flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-xs font-medium text-[#68778c] hover:bg-[#f6f8fb]"><CarFront size={15} /> Browse rentals</Link>
            </nav>
            <form action="/auth/signout" method="post" className="mt-3 border-t border-[#edf0f4] pt-3"><button type="submit" className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-xs font-medium text-[#758196] hover:bg-[#f6f8fb]"><LogOut size={15} /> Sign out</button></form>
          </aside>
          <section className="min-w-0">{children}</section>
        </div>
      </div>
    </main>
  );
}
