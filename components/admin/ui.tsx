import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

export function AdminHeading({ eyebrow, title, description, action }: { eyebrow?: string; title: string; description?: string; action?: ReactNode }) {
  return <div className="mb-6 flex flex-wrap items-end justify-between gap-4"><div>{eyebrow && <p className="mb-1 text-[11px] font-medium text-[#8a96a8]">{eyebrow}</p>}<h1 className="text-[26px] lg:text-[22px] max-lg:[font-family:var(--font-inter)] font-semibold tracking-tight text-[#0F2342] lg:text-[#25364e]">{title}</h1>{description && <p className="mt-1.5 max-w-2xl text-[13px] lg:text-xs leading-5 text-[#5B6F89] lg:text-[#7c899d]">{description}</p>}</div>{action}</div>;
}

export function AdminStat({ title, value, note, icon: Icon, tone = "blue", href }: { title: string; value: string; note: string; icon: LucideIcon; href?: string; tone?: "blue" | "green" | "orange" | "violet" }) {
  const tones = { blue: "bg-[#edf2ff] text-[#4c6fc9]", green: "bg-[#edf7f1] text-[#39825f]", orange: "bg-[#fff5e8] text-[#bc8232]", violet: "bg-[#f2efff] text-[#785fbb]" };
  const style = "block rounded-xl border border-[#e7ecf3] bg-white p-4 shadow-sm sm:p-5";
  const content = <><div className="flex items-start justify-between gap-2">
    <p className="text-[11px] font-medium text-[#63738a]">{title}</p>
    <span className={`flex h-8 w-8 items-center justify-center rounded-lg ${tones[tone]}`}><Icon size={16} aria-hidden /></span>
  </div><p className="mt-3 text-[23px] font-semibold tracking-tight text-[#26374e]">{value}</p>
  <p className="mt-1.5 flex items-center justify-between gap-2 text-[10px] text-[#63738a]">{note}{href && <ArrowUpRight size={15} aria-hidden />}</p></>;
  return href ? <Link href={href} className={`${style} transition hover:border-blue-300 hover:shadow-md focus-visible:ring-2 focus-visible:ring-blue-600`}>{content}</Link>
    : <article className={style}>{content}</article>;
}

export function AdminStatus({ status }: { status: string }) {
  const styles: Record<string, string> = { pending: "bg-[#fff6e8] text-[#a57120]", confirmed: "bg-[#edf2ff] text-[#4164bd]", picked_up: "bg-[#f1edff] text-[#6d55a7]", returned: "bg-[#eaf6f6] text-[#3c8184]", completed: "bg-[#edf7f1] text-[#347f59]", cancelled: "bg-[#f1f3f6] text-[#7d8999]", rejected: "bg-[#fff0f0] text-[#a94a4a]", approved: "bg-[#edf7f1] text-[#347f59]", none: "bg-[#f1f3f6] text-[#7d8999]" };
  const mobileTone = ["active", "approved", "verified", "completed"].includes(status) ? "max-lg:bg-[#E3F7EA] max-lg:text-[#12703A]"
    : ["pending", "payment_review", "needs_changes"].includes(status) ? "max-lg:bg-[#FFF2D6] max-lg:text-[#8A5A00]"
    : status === "rejected" ? "max-lg:bg-[#FDE8E8] max-lg:text-[#A12A2A]" : "";
  return <span className={`inline-flex whitespace-nowrap rounded-full px-2.5 py-1 text-[13px] lg:text-[10px] font-medium capitalize ${styles[status] ?? "bg-[#f1f3f6] text-[#7d8999]"} ${mobileTone}`}>{status.replaceAll("_", " ")}</span>;
}

export function peso(value: number) {
  return new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP", maximumFractionDigits: 0 }).format(value || 0);
}

export const adminInputClass = "h-9 w-full rounded-lg border border-[#dfe5ec] bg-white px-2.5 text-xs text-[#43536a] outline-none focus:border-[#94a9e9] focus:ring-3 focus:ring-[#2457d6]/10";

export const mobileCard = "min-w-0 rounded-xl border border-[#E3EEF9] bg-white p-4 text-sm text-[#0F2342]";
export const mobileAction = "inline-flex min-h-11 items-center justify-center rounded-lg border border-[#D6E6F7] px-3 text-[13px] font-semibold text-[#0A47B1] focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-50";
export const mobilePrimaryAction = "inline-flex min-h-11 items-center justify-center rounded-lg bg-[#0A47B1] px-3 text-[13px] font-semibold text-white focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-50";

export function AdminFilterChips({ label, value, options, onChange }: {
  label: string;
  value: string;
  options: { value: string; label: string; count?: number }[];
  onChange: (value: string) => void;
}) {
  return <div role="group" aria-label={label} className="flex min-w-0 gap-2 overflow-x-auto p-1">
    {options.map(option => <button type="button" key={option.value} aria-pressed={value === option.value}
      className={`${mobileAction} shrink-0 whitespace-nowrap bg-white aria-pressed:border-[#0A47B1] aria-pressed:bg-[#EAF4FF]`}
      onClick={() => onChange(option.value)}>{option.label}{option.count !== undefined && <span className="ml-1">{option.count}</span>}</button>)}
  </div>;
}

export function adminManilaDate(value: string) {
  return new Intl.DateTimeFormat("en-PH", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Manila" }).format(new Date(value));
}


export { peso as adminMoney } from "@/lib/plans/breakEven";
