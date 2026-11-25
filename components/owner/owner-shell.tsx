"use client";

import { OwnerMobileNavigation } from "./owner-mobile-navigation";
import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  CalendarDays, CalendarRange, CarFront, ChevronDown, CircleDollarSign, Megaphone, WalletCards, BadgeDollarSign,
  LayoutDashboard, Search,
} from "lucide-react";
import { Logo } from "@/components/logo";
import { NotificationBell } from "@/components/notifications/bell";

import { Star } from "lucide-react";

const navItems = [
  { href: "/owner", label: "Overview", icon: LayoutDashboard, exact: true },
  { href: "/owner/cars", label: "My cars", icon: CarFront },
  { href: "/owner/plan", label: "Plans and pricing", icon: BadgeDollarSign },
  { href: "/owner/promote", label: "Promote", icon: Megaphone },
  { href: "/owner/bookings", label: "Bookings", icon: CalendarDays },
  { href: "/owner/payments", label: "Payments", icon: CircleDollarSign },
  { href: "/owner/credits", label: "Credits", icon: WalletCards },
  { href: "/owner/reviews", label: "Reviews", icon: Star },
  { href: "/owner/payment-settings", label: "Payment settings", icon: WalletCards },
  { href: "/owner/calendar", label: "Calendar", icon: CalendarRange },
  { href: "/owner/earnings", label: "Earnings", icon: CircleDollarSign },
];

export function OwnerShell({ children, email, businessName, pendingBookings, bookingRequests, unansweredReviews, userId }: { children: ReactNode; email: string; businessName: string; pendingBookings: number; bookingRequests: number; unansweredReviews: number; userId: string }) {
  const pathname = usePathname();

  function navigation() {
    return <nav className="space-y-1">{navItems.map(({ href, label, icon: Icon, exact }) => {
      const active = exact ? pathname === href : pathname.startsWith(href);
      return <Link key={href} href={href} className={`flex h-10 items-center gap-3 rounded-lg px-3 text-[13px] font-medium transition ${active ? "bg-[#edf2ff] text-[#2457d6]" : "text-[#65738a] hover:bg-[#f4f6fa] hover:text-[#34445b]"}`}><Icon size={17} strokeWidth={1.8}/>{label}{label === "Bookings" && <span className={`ml-auto rounded-md px-1.5 py-0.5 text-[9px] ${pendingBookings ? "bg-[#fff1e5] font-semibold text-[#a65d26]" : "bg-[#f0f3f8] text-[#718096]"}`}>{pendingBookings || "Manage"}</span>}{href === "/owner/reviews" && unansweredReviews > 0 && <span className="ml-auto rounded bg-blue-50 px-2 text-xs">{unansweredReviews}</span>}</Link>;
    })}</nav>;
  }

  return (
    <div className="group/workspace min-h-screen bg-[#f4f7fc] text-[#26364e] lg:flex">
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-[250px] flex-col border-r border-[#e8edf4] bg-white px-4 pb-5 pt-5 lg:flex">
        <Link href="/owner" className="flex items-center gap-3 px-2 pb-7"><Logo size={40} /><span><span className="block text-sm font-semibold tracking-tight text-[#24364f]">Kuyog Bohol</span><span className="mt-0.5 block text-[10px] text-[#8b97a8]">Owner workspace</span></span></Link>
        <p className="mb-2 px-3 text-[10px] font-semibold uppercase tracking-[.12em] text-[#a0aaba]">Menu</p>{navigation()}
        <div className="mt-auto rounded-xl border border-[#e8edf4] bg-[#f8faff] p-3.5"><p className="text-[11px] font-semibold text-[#3c4c63]">Need help?</p><p className="mt-1 text-[10px] leading-4 text-[#8793a3]">Talk to our local owner support team.</p><Link href="/contact" className="mt-2 inline-block text-[10px] font-semibold text-[#2457d6]">Contact support →</Link></div>
      </aside>

      <main className="min-w-0 flex-1 lg:ml-[250px]">
        <header className="sticky top-0 z-30 flex h-[68px] items-center justify-between border-b border-[#e8edf4] bg-white/95 px-4 backdrop-blur sm:px-7 max-lg:h-[calc(68px+env(safe-area-inset-top))] max-lg:pt-[env(safe-area-inset-top)]">
          <div className="flex items-center gap-3"><Link href="/owner" aria-label="Kuyog Bohol owner home" className="inline-flex min-h-11 min-w-11 items-center gap-2 rounded-lg font-heading text-sm font-bold text-[#0F2342] focus-visible:outline-2 focus-visible:outline-[#0A47B1] lg:hidden"><Logo size={32} /><span>Kuyog Bohol</span></Link><div className="hidden items-center gap-2 rounded-lg bg-[#f5f7fb] px-3 py-2 text-[11px] text-[#8190a4] lg:flex"><Search size={14}/> Search workspace <kbd className="ml-6 rounded border border-[#e1e6ee] bg-white px-1.5 py-0.5 text-[9px]">⌘ K</kbd></div></div>
          <div className="flex items-center gap-3 sm:gap-5 max-lg:[&>div>button]:size-11 max-lg:[&>div>button]:focus-visible:outline-2 max-lg:[&>div>button]:focus-visible:outline-[#0A47B1]"><NotificationBell userId={userId}/><div className="hidden h-7 w-px bg-[#e8edf4] lg:block"/><div className="flex items-center gap-2.5"><span className="flex h-9 w-9 items-center justify-center rounded-full bg-[#e9efff] text-[11px] font-semibold text-[#4567be]">{businessName.slice(0, 1).toUpperCase()}</span><div className="hidden lg:block"><p className="max-w-40 truncate text-[11px] font-semibold text-[#34445b]">{businessName}</p><p className="max-w-40 truncate text-[10px] text-[#8b97a8]">{email}</p></div><ChevronDown size={14} className="hidden text-[#8793a3] lg:block"/></div><form action="/auth/signout" method="post" className="hidden lg:block"><button className="text-[11px] font-medium text-[#738197] hover:text-[#2457d6]">Sign out</button></form></div>
        </header>
        <div className="mx-auto w-full max-w-[1440px] px-4 pb-[calc(7rem+env(safe-area-inset-bottom))] pt-6 sm:px-7 sm:pt-8 lg:pb-8">{children}</div>
        <OwnerMobileNavigation key={pathname} pathname={pathname} businessName={businessName} email={email}
          pendingBookings={pendingBookings} bookingRequests={bookingRequests} unansweredReviews={unansweredReviews} />
      </main>
    </div>
  );
}
