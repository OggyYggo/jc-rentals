"use client";

import { SignOutForm } from "@/components/notifications/sign-out-form";
import Link from "next/link";
import { useState, useSyncExternalStore } from "react";
import { BadgeDollarSign, CalendarDays, CalendarRange, CarFront, CircleDollarSign, CircleHelp, Ellipsis, Home, LogOut, Megaphone, ScanLine, Star, WalletCards, X, type LucideIcon } from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import { ScanPickupLink } from "@/components/pickup/ScanPickupLink";
import { ownerInitials } from "./ui";
import { UsersRound } from "lucide-react";
import { onboardingCopy } from "@/lib/onboarding/content";

const groups = [
  { label: "Operations", links: [
    { href: "/owner/calendar", label: "Calendar", icon: CalendarRange },
    { href: "/owner/cars", label: "My vehicles", icon: CarFront },
    { href: "/owner/reviews", label: "Reviews", icon: Star },
    { href: "/owner/promote", label: "Promote", icon: Megaphone },
    { href: "/owner/staff", label: "Handover staff", icon: UsersRound },
  ] },
  { label: "Money", links: [
    { href: "/owner/credits", label: "Credits", icon: WalletCards },
    { href: "/owner/earnings", label: "Earnings", icon: CircleDollarSign },
    { href: "/owner/payment-settings", label: "Payment settings", icon: WalletCards },
    { href: "/owner/plan", label: "Plans and pricing", icon: BadgeDollarSign },
  ] },
];

const focus = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0A47B1]";
const tab = `relative flex min-h-[60px] min-w-0 flex-col items-center justify-center gap-0.5 rounded-xl px-0.5 text-[13px] font-semibold leading-none ${focus}`;
const menuItem = `flex min-h-11 w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-semibold text-[#0F2342] hover:bg-[#F3F9FF] ${focus}`;
const activeStyle = "bg-[#EAF4FF] text-[#0A47B1]";
const desktopQuery = "(min-width: 1024px)";
const isDesktop = () => window.matchMedia(desktopQuery).matches;
const serverDesktop = () => false;
function subscribeDesktop(callback: () => void) {
  const media = window.matchMedia(desktopQuery);
  media.addEventListener("change", callback);
  return () => media.removeEventListener("change", callback);
}

function matchesPath(pathname: string, href: string) {
  return pathname === href || (href !== "/owner" && pathname.startsWith(`${href}/`));
}

function CountBadge({ count, label, className = "" }: { count: number; label: string; className?: string }) {
  if (count <= 0) return null;
  return <>
    <span aria-hidden="true" className={`grid size-5 shrink-0 place-items-center rounded-full bg-[#D92D20] text-xs font-bold leading-none text-white ${className}`}>{count > 9 ? "9+" : count}</span>
    <span className="sr-only">{count} {label}</span>
  </>;
}

function TabLink({ href, label, icon: Icon, active, count, badgeLabel }: {
  href: string; label: string; icon: LucideIcon; active: boolean; count?: number; badgeLabel?: string;
}) {
  return <Link href={href} aria-current={active ? "page" : undefined} className={`${tab} ${active ? activeStyle : "text-[#5B6F89]"}`}>
    <span className="relative"><Icon size={21} aria-hidden="true" />
      {!!count && badgeLabel && <CountBadge count={count} label={badgeLabel} className="absolute -right-4 -top-2" />}
    </span>
    {label}
  </Link>;
}

export function OwnerMobileNavigation({ pathname, businessName, email, bookingRequests, pendingBookings, unansweredReviews }: {
  pathname: string; businessName: string; email: string; bookingRequests: number; pendingBookings: number; unansweredReviews: number;
}) {
  const [open, setOpen] = useState(false);
  const desktop = useSyncExternalStore(subscribeDesktop, isDesktop, serverDesktop);
  const menuOpen = open && !desktop;

  return <Dialog.Root open={menuOpen} onOpenChange={setOpen}>
    <nav aria-label="Owner workspace" className="fixed inset-x-0 bottom-0 z-40 border-t border-[#D6E6F7] bg-white pb-[env(safe-area-inset-bottom)] shadow-[0_-4px_20px_rgba(15,35,66,.09)] group-has-[[data-owner-camera]]/workspace:hidden lg:hidden">
      <div className="mx-auto grid min-h-[68px] max-w-2xl grid-cols-5 items-start gap-0.5 px-1 pt-1">
        <TabLink href="/owner" label="Home" icon={Home} active={matchesPath(pathname, "/owner")} />
        <TabLink href="/owner/bookings" label="Bookings" icon={CalendarDays} active={matchesPath(pathname, "/owner/bookings")}
          count={bookingRequests} badgeLabel={bookingRequests === 1 ? "booking request" : "booking requests"} />
        <ScanPickupLink aria-label="Scan pickup pass" aria-current={matchesPath(pathname, "/owner/scan") ? "page" : undefined}
          className={`relative -mt-5 flex min-w-0 flex-col items-center gap-1 rounded-xl text-[13px] font-semibold leading-none text-[#0A47B1] ${focus}`}>
          <span className="grid size-[60px] shrink-0 place-items-center rounded-full bg-[#0A47B1] text-white shadow-md ring-4 ring-white"><ScanLine size={25} aria-hidden="true" /></span>
          <span aria-hidden="true">Scan</span>
        </ScanPickupLink>
        <TabLink href="/owner/payments" label="Payments" icon={CircleDollarSign} active={matchesPath(pathname, "/owner/payments")}
          count={pendingBookings} badgeLabel={pendingBookings === 1 ? "deposit to review" : "deposits to review"} />
        <Dialog.Trigger className={`${tab} ${menuOpen ? activeStyle : "text-[#5B6F89]"}`}><Ellipsis size={22} aria-hidden="true" />More</Dialog.Trigger>
      </div>
    </nav>
    <Dialog.Portal>
      <Dialog.Backdrop className="fixed inset-0 z-50 bg-[#0F2342]/45 lg:hidden" />
      <Dialog.Popup className="fixed inset-x-0 bottom-0 z-50 mx-auto flex max-h-[100dvh] w-full max-w-lg flex-col overflow-y-auto overscroll-contain rounded-t-3xl bg-white px-4 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-[max(1rem,env(safe-area-inset-top))] font-body shadow-xl outline-none lg:hidden">
        <div className="mb-3 flex min-w-0 items-center gap-3 border-b border-[#E3EEF9] pb-3">
          <span aria-hidden="true" className="grid size-11 shrink-0 place-items-center rounded-full bg-[#EAF4FF] font-heading font-bold text-[#0A47B1]">{ownerInitials(businessName)}</span>
          <div className="min-w-0 flex-1">
            <Dialog.Title className="sr-only">Owner menu</Dialog.Title>
            <p className="break-words font-heading text-base font-bold text-[#0F2342]">{businessName}</p>
            <p className="break-all text-[13px] text-[#5B6F89]">{email}</p>
          </div>
          <Dialog.Close aria-label="Close owner menu" className={`grid size-11 shrink-0 place-items-center rounded-xl text-[#5B6F89] ${focus}`}><X size={22} aria-hidden="true" /></Dialog.Close>
        </div>
        <nav aria-label="More owner tools" className="space-y-3">
          {groups.map(group => <section key={group.label}>
            <h2 className="px-3 text-[13px] font-semibold text-[#5B6F89]">{group.label}</h2>
            {group.links.map(({ href, label, icon: Icon }) => {
              const active = matchesPath(pathname, href);
              return <Link key={href} href={href} aria-current={active ? "page" : undefined} onNavigate={() => setOpen(false)}
                className={`${menuItem} ${active ? activeStyle : ""}`}><Icon size={18} aria-hidden="true" />{label}
                {href === "/owner/reviews" && <CountBadge count={unansweredReviews} label={unansweredReviews === 1 ? "review to reply to" : "reviews to reply to"} className="ml-auto" />}
              </Link>;
            })}
          </section>)}
          <section>
            <h2 className="px-3 text-[13px] font-semibold text-[#5B6F89]">Help</h2>
            <Link href="/owner/help" onNavigate={() => setOpen(false)} className={menuItem}><CircleHelp size={18} aria-hidden="true" />{onboardingCopy.en.help}</Link>
            <SignOutForm>
              <button type="submit" className={menuItem}><LogOut size={18} aria-hidden="true" />Sign out</button>
            </SignOutForm>
          </section>
        </nav>
      </Dialog.Popup>
    </Dialog.Portal>
  </Dialog.Root>;
}
