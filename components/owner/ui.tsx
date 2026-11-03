import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

export function PageHeading({ eyebrow, title, description, action }: { eyebrow?: string; title: string; description?: string; action?: ReactNode }) {
  return <div className="mb-6 flex flex-wrap items-end justify-between gap-4"><div>{eyebrow && <p className="mb-1 text-[11px] font-medium text-[#8a96a8]">{eyebrow}</p>}<h1 className="text-[22px] font-semibold tracking-tight text-[#25364e]">{title}</h1>{description && <p className="mt-1.5 max-w-2xl text-xs leading-5 text-[#7c899d]">{description}</p>}</div>{action}</div>;
}

export function StatCard({ title, value, note, icon: Icon, trend, tone = "blue" }: { title: string; value: string; note: string; icon: LucideIcon; trend?: string; tone?: "blue" | "green" | "orange" | "violet" }) {
  const tones = { blue: "bg-[#edf2ff] text-[#4c6fc9]", green: "bg-[#edf7f1] text-[#39825f]", orange: "bg-[#fff5e8] text-[#bc8232]", violet: "bg-[#f2efff] text-[#785fbb]" };
  return <article className="rounded-xl border border-[#e7ecf3] bg-white p-4 shadow-[0_2px_6px_rgba(20,42,78,.025)] sm:p-5"><div className="flex items-start justify-between gap-2"><p className="text-[11px] font-medium text-[#7d8a9e]">{title}</p><span className={`flex h-8 w-8 items-center justify-center rounded-lg ${tones[tone]}`}><Icon size={16}/></span></div><p className="mt-3 text-[23px] font-semibold tracking-tight text-[#26374e]">{value}</p><div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[10px] text-[#8995a6]">{trend && <span className="font-semibold text-[#318565]">{trend}</span>}{note}</div></article>;
}

export function StatusPill({ status }: { status: string }) {
  const styles: Record<string, string> = {
    pending: "bg-[#fff6e8] text-[#a57120]",
    confirmed: "bg-[#edf2ff] text-[#4164bd]",
    picked_up: "bg-[#f1edff] text-[#6d55a7]",
    returned: "bg-[#eaf6f6] text-[#3c8184]",
    completed: "bg-[#edf7f1] text-[#347f59]",
    cancelled: "bg-[#f1f3f6] text-[#7d8999]",
    rejected: "bg-[#fff0f0] text-[#a94a4a]",
  };
  return <span className={`inline-flex whitespace-nowrap rounded-full px-2.5 py-1 text-[10px] font-medium capitalize ${styles[status] ?? "bg-[#f1f3f6] text-[#7d8999]"}`}>{status.replaceAll("_", " ")}</span>;
}

export function formatPeso(value: number) {
  return new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP", maximumFractionDigits: 0 }).format(value || 0);
}

export function formatShortDate(value: string) {
  return new Intl.DateTimeFormat("en-PH", { month: "short", day: "numeric", year: "numeric" }).format(new Date(`${value}T00:00:00`));
}
