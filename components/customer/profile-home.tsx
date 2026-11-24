import Link from "next/link";
import { Bell, CalendarDays, ChevronRight, CircleHelp, ContactRound, IdCard, LogOut, Pencil, ShieldCheck, Star, UserRound } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { documentStatus } from "./document-status";

const rowClass = "flex min-h-14 w-full items-center gap-3 px-3 py-2 text-left text-[#0F2342] hover:bg-[#F3F9FF] focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[#0A47B1]";
const tile = "grid size-[38px] shrink-0 place-items-center rounded-xl bg-[#EAF4FF] text-[#0A3D91]";
const card = "gap-0 rounded-2xl border border-[#E3EEF9] bg-white py-0 ring-0";

export function ProfileHome({ name, email, joinedAt, hasLicense, hasId, verification, selfieStatus, selfieUnavailable, bookingCounts, tripsToRate }: {
  name: string; email?: string; joinedAt?: string; hasLicense: boolean; hasId: boolean;
  verification: string; selfieStatus?: string; selfieUnavailable: boolean;
  bookingCounts: { toPay: number; upcoming: number } | null; tripsToRate: number | null;
}) {
  const initials = name.trim().split(/\s+/).filter(Boolean).slice(0, 2).map(word => Array.from(word)[0]).join("").toLocaleUpperCase();
  const memberSince = joinedAt && Number.isFinite(Date.parse(joinedAt))
    ? new Intl.DateTimeFormat("en-PH", { month: "short", year: "numeric", timeZone: "Asia/Manila" }).format(new Date(joinedAt)) : null;
  const bookingDocuments = [documentStatus(hasLicense, verification), documentStatus(hasId, verification)];
  const selfie = selfieUnavailable ? "Unavailable" : documentStatus(Boolean(selfieStatus), selfieStatus);
  const documents = [...bookingDocuments, selfie];
  const approved = documents.filter(status => status === "Approved").length;
  const missing = documents.filter(status => status === "Needed").length;
  const bookingVerified = bookingDocuments.every(status => status === "Approved");
  const chip = bookingVerified ? { label: "Verified for booking", style: "bg-[#E3F7EA] text-[#12703A]" }
    : bookingDocuments.includes("Rejected") ? { label: "Needs attention", style: "bg-[#FDE8E8] text-[#A12A2A]" }
    : bookingDocuments.includes("Under review") ? { label: "Verification in progress", style: "bg-[#FFF2D6] text-[#8A5A00]" }
    : { label: "Not verified", style: "bg-[#FFF2D6] text-[#8A5A00]" };
  const menu = [
    { label: "Personal details", subtitle: "Name and phone number", href: "/account/profile?section=details", icon: ContactRound },
    { label: "Documents and ID", subtitle: "Driver’s license, valid ID and selfie", href: "/account/profile?section=documents", icon: IdCard, missing },
    { label: "My bookings", subtitle: bookingCounts ? `${bookingCounts.toPay} to pay · ${bookingCounts.upcoming} upcoming` : "View your rentals", href: "/account/bookings", icon: CalendarDays },
    { label: "My reviews", subtitle: tripsToRate === null ? "Read or leave trip feedback" : `${tripsToRate} ${tripsToRate === 1 ? "trip" : "trips"} to rate`, href: "/account/bookings?view=reviews", icon: Star },
    { label: "Notifications", subtitle: "Booking alerts and preferences", href: "/notifications", icon: Bell },
  ];

  return <div className="space-y-4 font-body">
    <Card className={`${card} items-center px-4 py-5 text-center`}>
      <div aria-hidden="true" className="grid size-20 place-items-center rounded-full bg-[#EAF4FF] text-2xl font-bold text-[#0A3D91] ring-4 ring-[#F3F9FF]">
        {initials || <UserRound size={32} />}
      </div>
      <h1 className="mt-3 max-w-full break-words font-heading text-[22px] font-bold tracking-tight text-[#0F2342]">{name || "Your profile"}</h1>
      {email && <p className="mt-0.5 max-w-full break-all text-sm text-[#5B6F89]">{email}</p>}
      {memberSince && <p className="mt-0.5 text-xs text-[#5B6F89]">Member since {memberSince}</p>}
      <Badge className={`mt-3 h-auto border-0 px-2.5 py-1 text-xs font-semibold ${chip.style}`}>{chip.label}</Badge>
      <Link href="/account/profile?section=details" className={buttonVariants({ variant: "outline", className: "mt-3 min-h-11 gap-2 rounded-full border-[#D6E6F7] px-4 font-semibold text-[#0A3D91]" })}><Pencil size={15} aria-hidden="true" />Edit profile</Link>
    </Card>

    {approved < 3 && <Card className={`${card} p-4`}>
      <Link href="/account/profile?section=documents" className="block rounded-md focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#0A47B1]">
        <div className="flex items-center justify-between gap-2">
          <h2 className="flex items-center gap-2 font-heading text-base font-semibold text-[#0F2342]"><ShieldCheck size={18} aria-hidden="true" className="text-[#0A3D91]" />Document progress</h2>
          <span className="text-xs font-semibold tabular-nums text-[#0A3D91]">{approved} of 3</span>
        </div>
        <progress aria-label="Documents approved" value={approved} max={3}
          className="mt-3 block h-2 w-full overflow-hidden rounded-full bg-[#EAF4FF] accent-[#0A47B1] [&::-moz-progress-bar]:bg-[#0A47B1] [&::-webkit-progress-bar]:bg-[#EAF4FF] [&::-webkit-progress-value]:bg-[#0A47B1]" />
        <p className="mt-2 text-sm text-[#5B6F89]">{bookingVerified && selfie === "Needed" ? "Upload a selfie with your ID to complete your documents." : documents.includes("Rejected") ? "Check the review feedback and replace your documents." : missing > 0 ? "Upload your remaining documents for review." : selfieUnavailable ? "Some verification details are temporarily unavailable." : "We’ll update your progress once the review is complete."}</p>
      </Link>
    </Card>}

    <nav aria-label="Profile menu">
      <Card className={card}><ul className="divide-y divide-[#EEF4FB]">
        {menu.map(({ label, subtitle, href, icon: Icon, missing }) => <li key={href}>
          <Link href={href} className={rowClass}>
            <span className={tile}><Icon size={19} aria-hidden="true" /></span>
            <span className="min-w-0 flex-1"><span className="block text-sm font-semibold">{label}</span><span className="block text-xs leading-4 text-[#5B6F89]">{subtitle}</span></span>
            {Boolean(missing) && <Badge className="h-auto shrink-0 border-0 bg-[#FFF2D6] px-1.5 py-0.5 text-[10px] font-semibold text-[#8A5A00]">{missing} missing</Badge>}
            <ChevronRight size={16} aria-hidden="true" className="shrink-0 text-[#5B6F89]" />
          </Link>
        </li>)}
      </ul></Card>
    </nav>

    <Card className={card}>
      <Link href="/contact" className={rowClass}><span className={tile}><CircleHelp size={19} aria-hidden="true" /></span><span className="flex-1 text-sm font-semibold">Help and contact</span><ChevronRight size={16} aria-hidden="true" /></Link>
      <form action="/auth/signout" method="post" className="border-t border-[#EEF4FB]">
        <Button type="submit" variant="ghost" className={`${rowClass} justify-start rounded-none text-sm font-semibold text-[#A12A2A]`}><span className={tile}><LogOut size={19} aria-hidden="true" /></span>Sign out</Button>
      </form>
    </Card>
  </div>;
}
