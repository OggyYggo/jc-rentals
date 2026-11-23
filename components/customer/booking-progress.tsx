const statusDetails: Record<string, [string, string]> = {
  awaiting_payment: ["To pay", "bg-[#FFF2D6] text-[#8A5A00]"],
  payment_review: ["Payment review", "bg-[#EAF4FF] text-[#0A3D91]"],
  pending: ["Waiting for owner", "bg-[#EAF4FF] text-[#0A3D91]"],
  confirmed: ["Confirmed", "bg-[#E3F7EA] text-[#12703A]"],
  picked_up: ["On the road", "bg-[#EAF4FF] text-[#0A3D91]"],
  returned: ["Returned", "bg-slate-100 text-slate-700"],
  completed: ["Completed", "bg-slate-100 text-slate-700"],
  cancelled: ["Cancelled", "bg-[#FDE8E8] text-[#A12A2A]"],
  rejected: ["Rejected", "bg-[#FDE8E8] text-[#A12A2A]"],
  expired: ["Expired", "bg-[#FDE8E8] text-[#A12A2A]"],
};

export function BookingStatusChip({ status }: { status: string }) {
  const [label, color] = statusDetails[status] ?? [status, "bg-slate-100 text-slate-700"];
  return <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${color}`}>{label}</span>;
}

const steps = ["Request", "Pay deposit", "Owner confirms", "Pickup"];

export function BookingStepper({ status }: { status: string }) {
  const active = status === "awaiting_payment" ? 1 : ["payment_review", "pending"].includes(status) ? 2
    : ["confirmed", "picked_up", "returned", "completed"].includes(status) ? 3 : -1;
  if (active < 0) return null;
  return <ol aria-label="Booking progress" className="my-4 grid grid-cols-4 gap-1.5 rounded-2xl border border-[#D6E6F7] bg-white px-2.5 py-3 md:hidden">
    {steps.map((step, index) => <li key={step} aria-current={active === index ? "step" : undefined}
      className={`border-t-4 px-0.5 pt-1.5 text-center text-xs font-semibold ${index <= active ? "border-[#0A47B1] text-[#0A3D91]" : "border-[#E3EEF9] text-[#5B6F89]"} ${active === index ? "rounded-b-md bg-[#EAF4FF]" : ""}`}>
      {step}
    </li>)}
  </ol>;
}
