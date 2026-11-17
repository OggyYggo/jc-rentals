import { Check, ShieldCheck } from "lucide-react";
import { NextSteps } from "@/components/apply/NextSteps";

export function ApplySidebar() {
  return <aside className="space-y-4 lg:sticky lg:top-28 lg:mt-8"><div className="rounded-3xl border border-[#D6E6F7] bg-white p-6 shadow-sm"><h2 className="font-heading text-lg font-bold text-[#0F2342]">What happens next</h2><NextSteps/><div className="mt-6 border-t border-[#E3EEF9] pt-5"><h3 className="font-semibold text-[#0F2342]">Have these ready</h3><ul className="mt-3 space-y-3 text-sm text-[#51657F]">{["Clear photos of your car (3 to 8)", "OR/CR (vehicle registration)", "Your driver's license and a valid ID", "Your payment QR code"].map((item) => <li key={item} className="flex gap-2"><Check size={17} className="mt-0.5 shrink-0 text-[#0B63CE]"/>{item}</li>)}</ul></div></div><div className="flex gap-3 rounded-2xl bg-[#0A47B1] p-5 text-sm leading-6 text-white"><ShieldCheck className="mt-0.5 shrink-0"/><p>We review every application to keep Kuyog Bohol safe for customers and owners.</p></div></aside>;
}
