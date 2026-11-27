import Link from "next/link";
import { ArrowRight, CalendarDays, Check, ChevronRight, ClipboardList, Plus, Receipt, ScanLine, Star, Wallet, type LucideIcon } from "lucide-react";
import { ScanPickupLink } from "@/components/pickup/ScanPickupLink";
import { bookingRevenue, hasKeptFee } from "@/lib/booking-revenue";
import { paymentPeso } from "@/lib/payment-format";
import type { CreditState } from "./credit-state";
import { formatPeso, ownerInitials, StatusPill } from "./ui";

type Vehicle = { brand: string; model: string } | null;
type Contact = { full_name: string } | null;
type RecentBooking = {
  id: string; reference: string; total_price: number; cancel_fee_amount: number; status: string; customer: Contact; car: Vehicle;
};
export type UpcomingHandover = { id: string; date: string; time?: string | null; kind: "Pickup" | "Return"; customer: Contact; car: Vehicle };
type DashboardProps = {
  name: string; now: Date; today: string;
  deposits: number; requests: number | null; refunds: number; reviews: number;
  gross: number; net: number; rate: number; chartMonths: { label: string; amount: number }[];
  credits: CreditState | null; upcoming: UpcomingHandover[]; recent: RecentBooking[];
  fleet: { total: number; active: number };
};

const timezone = "Asia/Manila";
const dateLabel = new Intl.DateTimeFormat("en-US", { timeZone: timezone, weekday: "short", month: "short", day: "numeric" });
const monthLabel = new Intl.DateTimeFormat("en-PH", { timeZone: timezone, month: "long" });
const hourLabel = new Intl.DateTimeFormat("en-GB", { timeZone: timezone, hour: "numeric", hourCycle: "h23" });
const shortDate = new Intl.DateTimeFormat("en-US", { timeZone: timezone, month: "short", day: "numeric" });
const shortTime = new Intl.DateTimeFormat("en-US", { timeZone: timezone, hour: "numeric", minute: "2-digit" });

const focus = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0A47B1]";
const surface = "min-w-0 rounded-2xl border border-[#D6E6F7] bg-white p-4";
const title = "font-heading text-[15px] font-bold";
const muted = "text-[13px] leading-5 text-[#5B6F89]";
const iconTile = "grid size-10 shrink-0 place-items-center rounded-xl bg-[#EAF4FF] text-[#0A47B1]";
const vehicleName = (car: Vehicle) => car ? `${car.brand} ${car.model}` : "Vehicle";

function SectionHeading({ label, action, href }: { label: string; action: string; href: string }) {
  return <div className="flex min-w-0 items-center justify-between gap-2">
    <h2 className={title}>{label}</h2>
    <Link href={href} className={`inline-flex min-h-11 shrink-0 items-center gap-1 rounded-md text-[13px] font-semibold text-[#0A47B1] ${focus}`}>{action} <ArrowRight size={14} aria-hidden="true" /></Link>
  </div>;
}

function Attention({ deposits, requests, refunds, reviews }: Pick<DashboardProps, "deposits" | "requests" | "refunds" | "reviews">) {
  const tasks: { label: string; copy: string; href: string; count: number; icon: LucideIcon }[] = [
    { label: "Deposits to review", copy: "Check the payment proof", href: "/owner/payments", count: deposits, icon: Receipt },
    { label: "Booking requests", copy: "Respond to new requests", href: "/owner/bookings", count: requests ?? 0, icon: ClipboardList },
    { label: "Refunds to send", copy: "Send refunds to customers", href: "/owner/payments?tab=refunds", count: refunds, icon: Wallet },
    { label: "Reviews to reply", copy: "Reply to recent guests", href: "/owner/reviews", count: reviews, icon: Star },
  ];
  const total = tasks.reduce((sum, task) => sum + task.count, 0);
  if (!total) return requests !== null && <section className={`${surface} flex items-center gap-3`}>
    <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-[#E3F7EA] text-[#12703A]"><Check size={20} aria-hidden="true" /></span>
    <h2 className={title}>You&apos;re all caught up</h2>
  </section>;

  return <section className={`${surface} pb-1`}>
    <div className="flex items-center justify-between gap-2 pb-2">
      <h2 className={title}>Needs your attention</h2>
      <span className="shrink-0 rounded-full bg-[#FFF2D6] px-2.5 py-1 text-[13px] font-semibold text-[#8A5A00]">{total} {total === 1 ? "task" : "tasks"}</span>
    </div>
    <ul className="divide-y divide-[#E3EEF9]">
      {tasks.filter(({ count }) => count > 0).map(({ label, copy, href, count, icon: Icon }) => <li key={href}>
        <Link href={href} className={`flex min-h-14 items-center gap-2 rounded-md py-2 ${focus}`}>
          <span className={iconTile}><Icon size={18} aria-hidden="true" /></span>
          <span className="min-w-0 flex-1"><span className="block text-[15px] font-semibold">{label}</span><span className={muted}>{copy}</span></span>
          <span className="shrink-0 rounded-full bg-[#FFF2D6] px-2.5 py-1 text-[13px] font-bold text-[#8A5A00]">{count}</span>
          <ChevronRight size={15} className="shrink-0 text-[#5B6F89]" aria-hidden="true" />
        </Link>
      </li>)}
    </ul>
  </section>;
}

function Earnings({ now, gross, net, rate, chartMonths }: Pick<DashboardProps, "now" | "gross" | "net" | "rate" | "chartMonths">) {
  const previous = chartMonths.at(-2)?.amount ?? 0;
  const change = previous > 0 ? Math.round((net - previous) / previous * 100) : null;
  const max = Math.max(1, ...chartMonths.map(month => month.amount));
  return <Link href="/owner/earnings" className={`block min-w-0 rounded-2xl bg-[#0A47B1] p-4 text-white ${focus}`}>
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h2 className={title}>Your earnings &middot; {monthLabel.format(now)}</h2>
      {change !== null && <span className="rounded-full bg-white px-2.5 py-1 text-[13px] font-semibold text-[#0A3D91]">{change > 0 ? "+" : ""}{change}% <span className="sr-only">vs. last month</span></span>}
    </div>
    <p className="mt-1 break-words font-heading text-[32px] font-bold leading-tight tabular-nums">{formatPeso(net)}</p>
    <p className="mt-0.5 break-words text-[13px] text-[#EAF4FF]">Gross {formatPeso(gross)} &middot; {rate}% platform fee</p>
    <ul aria-label="Net earnings over six months" className="mt-3 grid grid-cols-6 gap-2 rounded-xl bg-white p-3">
      {chartMonths.map(({ label, amount }, index) => <li key={label} className="min-w-0 text-center">
        <div aria-hidden="true" className="flex h-14 items-end rounded bg-[#F3F9FF]">
          <div className={`w-full rounded-t-sm ${index === chartMonths.length - 1 ? "bg-[#0A47B1]" : "bg-[#C9DAF3]"}`} style={{ height: `${Math.max(0, amount) / max * 100}%` }} />
        </div>
        <p className="mt-1 text-[10px] font-semibold text-[#5B6F89]">{label}<span className="sr-only"> {formatPeso(amount)}</span></p>
      </li>)}
    </ul>
  </Link>;
}

function CreditsRow({ credits }: { credits: CreditState }) {
  const empty = credits.available <= 0;
  const low = empty || credits.available < credits.low_threshold;
  return <section className={`${surface} flex flex-wrap items-center gap-2.5`}>
    <span className={iconTile}><Wallet size={18} aria-hidden="true" /></span>
    <div className="min-w-0 flex-1 basis-24">
      <h2 className={title}>Owner credits</h2>
      <p className={`break-words tabular-nums ${muted}`}>{paymentPeso(credits.available)} available</p>
      {low && <span className={`mt-1 inline-block rounded-full px-2 py-0.5 text-[13px] font-semibold ${empty ? "bg-[#FDE8E8] text-[#A12A2A]" : "bg-[#FFF2D6] text-[#8A5A00]"}`}>{empty ? "No credits" : "Low"}</span>}
    </div>
    <Link href="/owner/credits/top-up" className={`inline-flex min-h-11 shrink-0 items-center rounded-xl bg-[#EAF4FF] px-3 text-[13px] font-bold text-[#0A47B1] ${focus}`}>Top up</Link>
  </section>;
}

export function MobileDashboard(props: DashboardProps) {
  const { name, now, today, credits, upcoming, recent, fleet } = props;
  const hour = Number(hourLabel.format(now));
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  return <div className="space-y-4 font-body text-[#0F2342] sm:hidden">
    <div>
      <p className={muted}>{dateLabel.format(now)}</p>
      <h1 className="mt-1 break-words font-heading text-[27px] font-bold leading-tight tracking-tight">{greeting}, {name}</h1>
    </div>
    <div className="grid grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] gap-2">
      <ScanPickupLink className={`flex min-h-[50px] items-center justify-center gap-1.5 rounded-xl bg-[#0A47B1] px-2 text-center text-[13px] font-bold text-white ${focus}`}><ScanLine size={18} className="shrink-0" aria-hidden="true" /> Scan pickup pass</ScanPickupLink>
      <Link href="/owner/cars?new=1" className={`flex min-h-[50px] items-center justify-center gap-1.5 rounded-xl border border-[#D6E6F7] bg-white px-2 text-center text-[13px] font-bold text-[#0A47B1] ${focus}`}><Plus size={17} className="shrink-0" aria-hidden="true" /> Add vehicle</Link>
    </div>
    <Attention {...props} />
    <Earnings {...props} />
    {credits && <CreditsRow credits={credits} />}
    {upcoming.length > 0 && <section className={surface}>
      <SectionHeading label="Coming up" action="Calendar" href="/owner/calendar" />
      <ul className="divide-y divide-[#E3EEF9]">{upcoming.map(({ id, date, time, kind, customer, car }) => <li key={id} className="flex flex-wrap items-center gap-2 py-2">
        <div className="grid min-w-[68px] shrink-0 justify-items-center rounded-xl bg-[#F3F9FF] px-1.5 py-2 text-[13px] font-bold text-[#0A3D91]">
          <time dateTime={date}>{date === today ? "TODAY" : shortDate.format(new Date(`${date}T00:00:00+08:00`)).toUpperCase()}</time>
          {time && <time className="font-medium" dateTime={time}>{shortTime.format(new Date(`${date}T${time.slice(0, 5)}:00+08:00`))}</time>}
        </div>
        <div className="min-w-0 flex-1"><p className="break-words text-[15px] font-semibold">{customer?.full_name || "Customer"}</p><p className={`break-words ${muted}`}>{vehicleName(car)}</p></div>
        <span className={`shrink-0 rounded-full px-2 py-1 text-[13px] font-semibold ${kind === "Pickup" ? "bg-[#E3F7EA] text-[#12703A]" : "bg-[#EAF4FF] text-[#0A47B1]"}`}>{kind}</span>
      </li>)}</ul>
    </section>}
    <section className={surface}>
      <SectionHeading label="Recent bookings" action="See all" href="/owner/bookings" />
      {recent.length ? <ul className="divide-y divide-[#E3EEF9]">{recent.map(booking => {
        const customer = booking.customer?.full_name || "Customer";
        return <li key={booking.id} className="flex items-start gap-2 py-2.5">
          <span aria-hidden="true" className={`${iconTile} rounded-full text-[13px] font-bold`}>{ownerInitials(customer)}</span>
          <div className="min-w-0 flex-1"><p className="break-words text-[15px] font-semibold">{customer}</p><p className={`[overflow-wrap:anywhere] ${muted}`}>{vehicleName(booking.car)} &middot; {booking.reference}</p></div>
          <div className="max-w-[46%] min-w-0 text-right">
            <p className="[overflow-wrap:anywhere] text-[13px] font-bold tabular-nums">{paymentPeso(bookingRevenue(booking))}</p>
            <div className="mt-1">{hasKeptFee(booking) ? <span className="inline-block rounded-full bg-slate-100 px-2 py-1 text-[13px] text-slate-700">Cancelled (fee kept)</span> : <StatusPill status={booking.status} mobile />}</div>
          </div>
        </li>;
      })}</ul> : <Link href="/owner/promote" className={`flex min-h-11 items-center rounded-md text-[13px] text-[#0A47B1] underline ${focus}`}>No bookings yet. Share your vehicle link to get started.</Link>}
    </section>
    <section className={surface}>
      <SectionHeading label="Your fleet" action="Manage" href="/owner/cars" />
      <dl className="grid grid-cols-3 gap-2">
        {[["Vehicles", fleet.total], ["Active", fleet.active], ["Hidden", fleet.total - fleet.active]].map(([label, count]) => <div key={label} className="min-w-0 rounded-xl bg-[#F3F9FF] p-2 text-center">
          <dt className={muted}>{label}</dt><dd className="font-heading text-xl font-bold tabular-nums">{count}</dd>
        </div>)}
      </dl>
    </section>
  </div>;
}
