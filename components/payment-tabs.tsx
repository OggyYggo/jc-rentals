import Link from "next/link";

export function PaymentTabs({ path, active, tabs, filters }: {
  path: string; active: string; tabs: Record<string, string>; filters?: Record<string, string>;
}) {
  return <nav aria-label="Payment views" className="mb-4 flex flex-wrap gap-2">
    {Object.entries(tabs).map(([key, label]) => <Link key={key}
      href={`${path}?${new URLSearchParams({ ...filters, tab: key })}`}
      aria-current={key === active ? "page" : undefined}
      className={`inline-flex min-h-11 items-center rounded-lg border px-3 text-sm font-semibold ${key === active ? "bg-blue-700 text-white" : "bg-white text-blue-800"}`}>
      {label}
    </Link>)}
  </nav>;
}
