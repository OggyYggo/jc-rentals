import Link from "next/link";
import { CalendarDays, ScanLine, UserRound } from "lucide-react";
import { staffContext, type StaffBusiness, type StaffToday } from "@/lib/staff/context";
import { SignOutForm } from "@/components/notifications/sign-out-form";
import { StaffLoadError } from "./load-error";
import { staffAction, staffCard, staffPrimary } from "./shared";

type View = "home" | "scan" | "today" | "account";
export function staffHref(path: string, owner?: string) {
  return owner ? `${path}?business=${encodeURIComponent(owner)}` : path;
}

const tabs = [
  { path: "/staff/scan", key: "scan", label: "Scan", icon: ScanLine },
  { path: "/staff/today", key: "today", label: "Today", icon: CalendarDays },
  { path: "/staff/account", key: "account", label: "Account", icon: UserRound },
] as const;

export async function StaffWorkspace({ view, requested, scanner }: {
  view: View; requested?: string; scanner?: (business: StaffBusiness) => React.ReactNode;
}) {
  const { db, user, businesses } = await staffContext();
  const active = businesses.filter(item => item.enabled);
  const business = (requested ? businesses.find(item => item.owner_id === requested) : undefined) ?? active[0] ?? businesses[0];
  const available = Boolean(business?.enabled);
  const today = available && (view === "home" || view === "today")
    ? await db.rpc("staff_today_handovers",{ p_owner:business.owner_id }).overrideTypes<StaffToday[], { merge: false }>() : null;
  const rows = Array.isArray(today?.data) ? today.data : [];
  return <main className="mx-auto min-h-[75dvh] w-full max-w-2xl space-y-4 px-4 pt-5 pb-[calc(6rem+env(safe-area-inset-bottom))] font-body text-[#0F2342]">
    <header className="space-y-2">
      <span className="inline-block rounded-full bg-[#EAF4FF] px-3 py-1 text-[13px] font-semibold text-[#0A47B1]">Staff</span>
      <h1 className="break-words font-heading text-2xl font-bold">{view === "home" && available ? `Hi, ${business.display_name.split(/\s+/)[0]}`
        : view === "scan" ? "Scan pickup pass" : view === "today" ? "Today’s handovers" : view === "account" ? "Staff account" : "Handover staff"}</h1>
      {business && <p className="break-words text-sm text-[#5B6F89]">{business.business}</p>}
      {(active.length > 1 || (!available && active.length > 0)) && <nav aria-label="Switch business" className="flex flex-wrap gap-2">
        {active.map(item => <Link key={item.owner_id} className={`${staffAction} break-words text-center aria-[current=true]:bg-[#EAF4FF]`}
          aria-current={item.owner_id === business?.owner_id ? "true" : undefined}
          href={staffHref(view === "home" ? "/staff" : `/staff/${view}`,item.owner_id)}>{item.business}</Link>)}
      </nav>}
    </header>
    {!available ? <section className={`${staffCard} space-y-3`}>
      <p>{business ? `Your access was turned off. Contact ${business.business}.` : "You don’t have handover access yet. Ask a vehicle owner for an invitation."}</p>
      <SignOutForm><button type="submit" className={staffAction}>Sign out</button></SignOutForm>
    </section> : <>
      {view === "home" && <section className={`${staffCard} space-y-2`}>
        <h2 className="font-heading text-lg font-bold">Scan a pickup pass</h2>
        <p className="text-[#5B6F89]">Or enter the 6-digit code.</p>
        <Link className={`${staffPrimary} gap-2`} href={staffHref("/staff/scan",business.owner_id)}><ScanLine size={18} aria-hidden />Open scanner</Link>
      </section>}
      {view === "scan" && scanner?.(business)}
      {today && (today.error ? <StaffLoadError message="Could not load today’s handovers." /> : <section className={staffCard}>
        <h2 className="font-heading font-bold">Today</h2>
        <p className="mt-1 text-[#5B6F89]">{rows.filter(row => row.kind === "pickup").length} pickups · {rows.filter(row => row.kind === "return").length} returns · Manila time</p>
        {rows.length ? <ul className="mt-2 divide-y divide-[#E3EEF9]">{rows.map(row => <li key={`${row.reference}-${row.kind}`} className="flex flex-wrap items-center gap-2 py-3">
          <div className="min-w-0 flex-1 basis-32">
            <p className="break-words font-semibold">{row.vehicle_label} · {row.customer_name}</p>
            <p className="break-all text-[13px] text-[#5B6F89]">{row.reference} · {row.handover_time ? new Intl.DateTimeFormat("en-PH",{ timeZone:"Asia/Manila",hour:"numeric",minute:"2-digit" }).format(new Date(`2000-01-01T${row.handover_time.slice(0,5)}:00+08:00`)) : "Time not set"}</p>
          </div>
          <span className="rounded-full bg-[#EAF4FF] px-2.5 py-1 text-[13px] font-semibold text-[#0A47B1]">{row.kind === "pickup" ? "Pickup" : "Return"}</span>
        </li>)}</ul> : <p className="mt-3">No pickups or returns scheduled for today.</p>}
      </section>)}
      {view === "account" && <section className={`${staffCard} space-y-3`}>
        <p className="break-words font-semibold">{business.display_name}</p><p className="break-all">{user.email}</p><p className="break-words">{business.business}</p>
        <SignOutForm><button type="submit" className={staffAction}>Sign out</button></SignOutForm>
        <p>Need help? <a href="mailto:kuyogbohol@gmail.com" className="inline-flex min-h-11 items-center break-all text-[#0A47B1] underline">kuyogbohol@gmail.com</a></p>
      </section>}
    </>}
    <nav aria-label="Staff navigation" className="fixed inset-x-0 bottom-0 z-30 border-t border-[#D6E6F7] bg-white pb-[env(safe-area-inset-bottom)]">
      <div className="mx-auto grid max-w-2xl grid-cols-3">{tabs.map(({path,key,label,icon:Icon}) => <Link key={key}
        href={staffHref(path,business?.owner_id)} aria-current={view === key ? "page" : undefined}
        className="flex min-h-14 flex-col items-center justify-center gap-1 text-[13px] font-semibold text-[#0A47B1] aria-[current=page]:bg-[#EAF4FF] focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[#0A47B1]">
        <Icon size={19} aria-hidden />{label}
      </Link>)}</div>
    </nav>
  </main>;
}
