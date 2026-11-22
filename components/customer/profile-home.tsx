import Link from "next/link";
import { Bell, CalendarDays, ChevronRight, CircleHelp, ClipboardList, ContactRound, IdCard, LogOut, ShieldCheck, ShieldPlus, Star, UserRound } from "lucide-react";

const menu = [
  { label: "Personal details", href: "/account/profile?section=details", icon: ContactRound },
  { label: "Documents and ID", href: "/account/profile?section=documents", icon: IdCard },
  { label: "My bookings", href: "/account/bookings", icon: CalendarDays },
  { label: "Booking record", href: "/account/bookings?view=record", icon: ClipboardList },
  { label: "My reviews", href: "/account/bookings?view=reviews", icon: Star },
  { label: "Notifications", href: "/notifications", icon: Bell },
  { label: "Help", href: "/contact", icon: CircleHelp },
];

const rowClass = "flex min-h-12 w-full items-center gap-3.5 px-4 py-2 text-left text-sm font-semibold focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[#0B63CE] sm:px-5";

export function ProfileHome({ name, email, hasLicense, hasId, verification }: {
  name: string; email?: string; hasLicense: boolean; hasId: boolean; verification: string;
}) {
  const initials = name.trim().split(/\s+/).filter(Boolean).slice(0, 2).map(word => Array.from(word)[0]).join("").toLocaleUpperCase();
  const approved = verification === "approved";
  const documents = Number(hasLicense) + Number(hasId);
  const progress = approved ? 3 : documents;
  const status = approved ? "Your identity has been verified."
    : verification === "rejected" ? "Review the feedback and update your documents."
    : documents === 2 && verification === "pending" ? "Your documents are under review."
    : "Add your government ID and driver’s license for review.";

  return (
    <div className="space-y-4">
      <header className="flex items-center gap-3.5 rounded-2xl border border-[#d8e7fa] bg-[#eaf4ff] p-4 sm:gap-5 sm:p-6">
        <div aria-hidden="true" className="grid size-14 shrink-0 place-items-center rounded-full bg-[#0A3D91] text-xl font-semibold text-white sm:size-16 sm:text-2xl">
          {initials || <UserRound size={25} />}
        </div>
        <div className="min-w-0">
          <h1 className="break-words text-xl font-bold tracking-tight text-[#0F2342] sm:text-2xl">{name || "Your profile"}</h1>
          {email && <p className="mt-0.5 break-all text-sm text-[#435874]">{email}</p>}
        </div>
      </header>

      <section aria-labelledby="verification-heading" className="rounded-2xl border border-[#dfe7f1] bg-white p-4 sm:p-5">
        <div className="flex items-start gap-3">
          <span className={`grid size-10 shrink-0 place-items-center rounded-xl ${approved ? "bg-emerald-50 text-emerald-700" : "bg-[#ebf4ff] text-[#0A3D91]"}`}>
            {approved ? <ShieldCheck size={21} aria-hidden="true" /> : <ShieldPlus size={21} aria-hidden="true" />}
          </span>
          <div className="min-w-0 flex-1">
            <h2 id="verification-heading" className="font-semibold text-[#0F2342]">{approved ? "Verified" : "Get verified"}</h2>
            <p className="mt-0.5 text-sm text-[#52647a]">{status}</p>
          </div>
          <span aria-hidden="true" className="shrink-0 text-xs font-semibold tabular-nums text-[#435874]">{progress} of 3</span>
        </div>
        <div role="progressbar" aria-labelledby="verification-heading" aria-valuemin={0} aria-valuemax={3} aria-valuenow={progress} aria-valuetext={`${progress} of 3 steps complete`} className="mt-3 grid grid-cols-3 gap-1.5">
          {[1, 2, 3].map(step => <span key={step} className={`h-1.5 rounded-full ${step > progress ? "bg-slate-200" : approved ? "bg-emerald-600" : "bg-[#0B63CE]"}`} />)}
        </div>
        {!approved && <Link href="/account/profile?section=documents" className="mt-1 inline-flex min-h-11 items-center gap-1 text-sm font-semibold text-[#0A3D91] underline-offset-4 hover:underline">
          {verification === "rejected" ? "Review documents" : documents === 2 ? "View documents" : "Upload documents"}
          <ChevronRight size={16} aria-hidden="true" />
        </Link>}
      </section>

      <nav aria-label="Profile menu" className="overflow-hidden rounded-2xl border border-[#dfe7f1] bg-white">
        <ul className="divide-y divide-[#edf1f6]">
          {menu.map(({ label, href, icon: Icon }) => (
            <li key={href}>
              <Link href={href} className={`${rowClass} text-[#0F2342] hover:bg-[#f6f9fe]`}>
                <Icon size={19} aria-hidden="true" className="shrink-0 text-[#315d95]" />
                <span className="flex-1">{label}</span>
                <ChevronRight size={17} aria-hidden="true" className="text-[#657891]" />
              </Link>
            </li>
          ))}
          <li>
            <form action="/auth/signout" method="post">
              <button type="submit" className={`${rowClass} text-red-700 hover:bg-red-50`}>
                <LogOut size={19} aria-hidden="true" /> Sign out
              </button>
            </form>
          </li>
        </ul>
      </nav>
    </div>
  );
}
