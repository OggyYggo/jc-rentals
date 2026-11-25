"use client";

import { useEffect, useRef } from "react";
import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { CalendarDays, CarFront, ChevronDown, CircleDollarSign, LayoutDashboard, Ellipsis, Search, Settings2, ScrollText, Star, ShieldCheck, Store, Users, X, Megaphone } from "lucide-react";
import type { AdminAttention } from "@/lib/admin-attention";
import { Logo } from "@/components/logo";
import { NotificationBell } from "@/components/notifications/bell";

const navItems = [
  { href: "/admin", label: "Overview", icon: LayoutDashboard, exact: true },
  { href: "/admin/owners", label: "Owners", icon: Store },
  { href: "/admin/owner-applications", label: "Car applications", icon: CarFront },
  { href: "/admin/cars", label: "Cars", icon: CarFront },
  { href: "/admin/customers", label: "Customers", icon: Users },
  { href: "/admin/bookings", label: "Bookings", icon: CalendarDays },
  { href: "/admin/payments", label: "Payments", icon: CircleDollarSign },
  { href: "/admin/topups", label: "Top-ups", icon: CircleDollarSign },
  { href: "/admin/plan-payments", label: "Plan payments", icon: CircleDollarSign },
  { href: "/admin/fees", label: "Fees & credits", icon: CircleDollarSign },
  { href: "/admin/commissions", label: "Commissions", icon: CircleDollarSign },
  { href: "/admin/promotions", label: "Promotions", icon: Megaphone },
  { href: "/admin/reviews", label: "Reviews", icon: Star },
  { href: "/admin/settings", label: "Platform settings", icon: Settings2 },
  { href: "/admin/audit-log", label: "Audit log", icon: ScrollText },
];

const mainTabs = [
  { href: "/admin", label: "Home", icon: LayoutDashboard },
  navItems[5], navItems[6], navItems[1],
];

const moreGroups = [
  { label: "Marketplace", links: [navItems[2], { ...navItems[3], label: "Vehicles" }, navItems[4]] },
  { label: "Money", links: navItems.slice(7, 11) },
  { label: "Platform", links: navItems.slice(11) },
];

const badgeLabels = {
  deposits: "deposits to review", applications: "applications to review", documents: "customers to verify",
  topups: "top-ups to verify", plans: "plan payments to review", reviews: "open review reports",
};

const badges: Record<string, keyof AdminAttention> = {
  "/admin/payments": "deposits", "/admin/owner-applications": "applications", "/admin/customers": "documents",
  "/admin/topups": "topups", "/admin/plan-payments": "plans", "/admin/reviews": "reviews",
};

function Badge({ count, label }: { count: number | null; label: string }) {
  if (!count) return null;
  return <span className="rounded-full bg-[#D92D20] px-1.5 text-[13px] font-semibold text-white">
    <span aria-hidden>{count > 9 ? "9+" : count}</span><span className="sr-only">{count} {label}</span>
  </span>;
}

export function AdminShell({ children, email, fullName, userId, attention }: {
  children: ReactNode; email: string; fullName: string; userId: string; attention: AdminAttention;
}) {
  const pathname = usePathname();
  const sheet = useRef<HTMLDialogElement>(null);
  const moreTrigger = useRef<HTMLButtonElement>(null);
  const activeTab = mainTabs.find(({ href }) => isActive(href));
  const initials = (fullName || email).slice(0, 1).toUpperCase();

  useEffect(() => {
    const media = window.matchMedia("(min-width: 64rem)");
    const close = () => sheet.current?.close();
    const closeOnDesktop = () => { if (media.matches) close(); };
    media.addEventListener("change", closeOnDesktop);
    window.addEventListener("popstate", close);
    return () => {
      media.removeEventListener("change", closeOnDesktop);
      window.removeEventListener("popstate", close);
    };
  }, []);

  function isActive(href: string) {
    return pathname === href || (href !== "/admin" && pathname.startsWith(href + "/"));
  }

  function badge(href: string) {
    const key = badges[href];
    return key && <Badge count={attention[key]} label={badgeLabels[key]}/>;
  }

  function navigation() {
    return <nav className="space-y-1">{navItems.map(({ href, label, icon: Icon, exact }) => {
      const active = exact ? pathname === href : pathname.startsWith(href);
      return <Link key={href} href={href} className={`flex h-10 items-center gap-3 rounded-lg px-3 text-[13px] font-medium transition ${active ? "bg-[#edf2ff] text-[#2457d6]" : "text-[#65738a] hover:bg-[#f4f6fa] hover:text-[#34445b]"}`}><Icon size={17} strokeWidth={1.8}/>{label}{href === "/admin/reviews" && !!attention.reviews && <span className="ml-auto rounded bg-blue-50 px-2 text-xs">{attention.reviews}</span>}</Link>;
    })}</nav>;
  }

  return <div className="min-h-screen bg-[#f4f7fc] text-[#26364e] lg:flex">
    <aside className="fixed inset-y-0 left-0 z-40 hidden w-[250px] flex-col overflow-y-auto border-r border-[#e8edf4] bg-white px-4 pb-5 pt-5 lg:flex">
      <Link href="/admin" className="flex items-center gap-3 px-2 pb-7"><Logo size={40} /><span><span className="block text-sm font-semibold tracking-tight text-[#24364f]">Kuyog Bohol</span><span className="mt-0.5 block text-[10px] text-[#8b97a8]">Platform admin</span></span></Link>
      <p className="mb-2 px-3 text-[10px] font-semibold uppercase tracking-[.12em] text-[#a0aaba]">Management</p>{navigation()}
      <div className="mt-auto rounded-xl border border-[#e8edf4] bg-[#f8faff] p-3.5"><p className="flex items-center gap-1.5 text-[11px] font-semibold text-[#3c4c63]"><ShieldCheck size={13} className="text-[#5273c8]"/>Admin access</p><p className="mt-1 text-[10px] leading-4 text-[#8793a3]">Changes here affect the entire platform.</p></div>
    </aside>
    <main className="min-w-0 flex-1 lg:ml-[250px]">
      <header className="sticky top-0 z-30 flex h-[68px] items-center justify-between border-b border-[#e8edf4] bg-white/95 px-4 backdrop-blur sm:px-7"><div className="flex items-center gap-3"><Link href="/admin" aria-label="Admin home" className="flex min-h-11 items-center gap-2 lg:hidden"><Logo size={36}/><span className="rounded-full bg-[#EAF4FF] px-2 py-1 text-[13px] font-semibold text-[#0A47B1]">ADMIN</span></Link><div className="hidden items-center gap-2 rounded-lg bg-[#f5f7fb] px-3 py-2 text-[11px] text-[#8190a4] lg:flex"><Search size={14}/> Search platform <kbd className="ml-6 rounded border border-[#e1e6ee] bg-white px-1.5 py-0.5 text-[9px]">⌘ K</kbd></div></div><div className="flex items-center gap-3 sm:gap-5"><div className="contents max-lg:[&>div>button:first-child]:size-11 max-lg:[&>div>button:first-child]:focus-visible:outline-2"><NotificationBell userId={userId}/></div><div className="hidden h-7 w-px bg-[#e8edf4] lg:block"/><div className="flex items-center gap-2.5"><span className="flex h-9 w-9 items-center justify-center rounded-full bg-[#e9efff] text-[11px] font-semibold text-[#4567be]">{(fullName || email).slice(0, 1).toUpperCase()}</span><div className="hidden lg:block"><p className="max-w-40 truncate text-[11px] font-semibold text-[#34445b]">{fullName || "Administrator"}</p><p className="max-w-40 truncate text-[10px] text-[#8b97a8]">{email}</p></div><ChevronDown size={14} className="hidden text-[#8793a3] lg:block"/></div><form action="/auth/signout" method="post" className="hidden lg:block"><button className="text-[11px] font-medium text-[#738197] hover:text-[#2457d6]">Sign out</button></form></div></header>
      <nav aria-label="Admin tabs" className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 border-t border-[#D6E6F7] bg-white pb-[env(safe-area-inset-bottom)] text-[#5B6F89] shadow-[0_-4px_18px_#0f23421a] lg:hidden">
        {mainTabs.map(({ href, label, icon: Icon }) => <Link key={href} href={href} aria-current={isActive(href) ? "page" : undefined} className="relative flex min-h-16 flex-col items-center justify-center gap-1 text-[13px] font-semibold aria-[current=page]:bg-[#EAF4FF] aria-[current=page]:text-[#0A47B1] focus-visible:outline-2 focus-visible:-outline-offset-2">
          <Icon size={20} aria-hidden/>{label}<span className="absolute left-[55%] top-1">{badge(href)}</span>
        </Link>)}
        <button ref={moreTrigger} type="button" aria-haspopup="dialog" aria-current={activeTab ? undefined : "page"} onClick={() => sheet.current?.showModal()} className="flex min-h-16 flex-col items-center justify-center gap-1 text-[13px] font-semibold aria-[current=page]:bg-[#EAF4FF] aria-[current=page]:text-[#0A47B1] focus-visible:outline-2 focus-visible:-outline-offset-2"><Ellipsis size={20} aria-hidden/>More</button>
      </nav>
      <dialog ref={sheet} aria-labelledby="admin-more-title" onClose={() => {
        if (moreTrigger.current?.getClientRects().length) moreTrigger.current.focus();
      }} onKeyDown={event => {
        if (event.key !== "Tab") return;
        const controls = event.currentTarget.querySelectorAll<HTMLElement>("a[href], button:not(:disabled)");
        const first = controls[0];
        const last = controls[controls.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
      }} onClick={event => {
        if (event.target === event.currentTarget) sheet.current?.close();
      }} className="fixed inset-y-0 left-auto right-0 m-0 h-dvh max-h-none w-[min(92vw,400px)] max-w-none bg-white text-[#0F2342] backdrop:bg-[#0F2342]/45 lg:hidden">
        <div className="min-h-full px-4 pt-5 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
          <div className="mb-4 flex items-center gap-3 border-b border-[#E3EEF9] pb-4">
            <span className="grid size-11 shrink-0 place-items-center rounded-full bg-[#EAF4FF] font-semibold text-[#0A47B1]">{initials}</span>
            <div className="min-w-0 flex-1"><h2 id="admin-more-title" className="font-semibold">Platform admin</h2><p className="break-all text-[13px] text-[#5B6F89]">{email}</p></div>
            <button type="button" aria-label="Close More menu" onClick={() => sheet.current?.close()} className="grid size-11 shrink-0 place-items-center rounded-lg bg-[#F3F9FF]"><X size={20}/></button>
          </div>
          {moreGroups.map(group => <section key={group.label} className="mb-4">
            <h3 className="px-2 text-[13px] font-semibold text-[#5B6F89]">{group.label}</h3>
            {group.links.map(({ href, label, icon: Icon }) => <Link key={href} href={href} aria-current={isActive(href) ? "page" : undefined} onNavigate={() => sheet.current?.close()} className="flex min-h-11 items-center gap-3 rounded-lg px-2 text-sm font-medium aria-[current=page]:bg-[#EAF4FF] aria-[current=page]:text-[#0A47B1]">
              <Icon size={18} aria-hidden/>{label}<span className="ml-auto">{badge(href)}</span>
            </Link>)}
          </section>)}
          <form action="/auth/signout" method="post"><button className="min-h-11 w-full rounded-lg border border-[#D6E6F7] text-sm font-semibold text-[#0A47B1]">Sign out</button></form>
        </div>
      </dialog>
      <div className="admin-content mx-auto w-full max-w-[1440px] px-4 py-6 pb-[calc(7rem+env(safe-area-inset-bottom))] sm:px-7 sm:pt-8 lg:pb-8">{children}</div>
    </main>
  </div>;
}
