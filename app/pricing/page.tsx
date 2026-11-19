import type { Metadata } from "next";
import Link from "next/link";
import { Check, ArrowRight } from "lucide-react";
import { breakEvenBookings, ownerEarningsExample, peso } from "@/lib/plans/breakEven";
import { getPublicPlans } from "@/lib/plans/queries";

export const instant = false;
export const metadata: Metadata = {
  title: "Pricing for car owners | Kuyog Bohol",
  description: "List your car free. Pick a plan when you grow. Pay a small commission only when you get a booking.",
};

const supportLabel: Record<string, string> = { email: "Email support", priority: "Priority email support", priority_onboarding: "Priority support and onboarding help", custom: "Custom support" };
const money = (value: number) => value === 0 ? "Free" : `${peso(value)} / month`;

export default async function PricingPage() {
  const { plans, unavailable } = await getPublicPlans();
  const starter = plans.find((p) => p.code === "starter");
  const standard = plans.find((p) => p.code === "standard");
  const fleet = plans.find((p) => p.code === "fleet");
  const standardBreakEven = starter && standard ? breakEvenBookings(standard.price_php, starter.commission_rate, standard.commission_rate) : null;
  const fleetBreakEven = standard && fleet ? breakEvenBookings(fleet.price_php - standard.price_php, standard.commission_rate, fleet.commission_rate) : null;
  const example = starter ? ownerEarningsExample(3000, 3, starter.commission_rate) : null;

  return <main className="bg-[#f8fbff] text-[#182a44]">
    <section className="bg-[#0A47B1] px-5 pb-28 pt-16 text-center text-white sm:px-10 sm:pb-36 sm:pt-24 lg:px-[140px]"><p className="text-xs font-bold tracking-[.2em] text-blue-100">PRICING FOR CAR OWNERS</p><h1 className="mx-auto mt-4 max-w-3xl text-4xl font-bold tracking-tight sm:text-6xl">Simple pricing. No surprises.</h1><p className="mx-auto mt-5 max-w-2xl text-base leading-7 text-blue-100 sm:text-lg">Start free and pay commission only when you get a booking. Customers never pay a booking fee.</p></section>
    <section className="relative z-10 mx-auto -mt-16 grid max-w-6xl gap-5 px-5 sm:-mt-24 sm:grid-cols-3 sm:px-8">{plans.map((plan) => <article key={plan.id} className={`relative flex flex-col rounded-2xl border bg-white p-6 shadow-[0_16px_50px_rgba(20,57,112,.1)] ${plan.is_featured ? "border-2 border-[#1764d8] sm:-translate-y-2" : "border-[#e2eaf4]"}`}>
      {plan.is_featured && <span className="absolute -top-3 left-5 rounded-full bg-[#1764d8] px-3 py-1 text-[10px] font-bold tracking-wider text-white">MOST POPULAR</span>}
      <p className="text-sm font-semibold text-[#52657e]">{plan.name}</p><p className="mt-2 min-h-6 text-xs text-[#8190a3]">{plan.tagline}</p><p className="mt-4 text-3xl font-bold">{money(Number(plan.price_php))}</p><p className="mt-3 rounded-lg bg-[#f1f6fd] px-3 py-2 text-xs font-semibold text-[#315987]">{Number(plan.commission_rate * 100).toFixed(plan.commission_rate * 100 % 1 ? 1 : 0)}% commission · up to {plan.max_active_cars} cars</p>
      <ul className="mt-5 flex-1 space-y-3 border-t border-[#e8edf4] pt-5">{(plan.features ?? []).map((feature) => <li key={feature} className="flex gap-2 text-sm leading-5 text-[#526177]"><Check size={16} className="mt-0.5 shrink-0 text-[#2875ce]"/>{feature}</li>)}<li className="flex gap-2 text-sm leading-5 text-[#526177]"><Check size={16} className="mt-0.5 shrink-0 text-[#2875ce]"/>{supportLabel[plan.support_level] ?? plan.support_level}</li></ul>
      <Link href={`/apply?plan=${encodeURIComponent(plan.code)}`} className={`mt-6 flex min-h-11 items-center justify-center gap-2 rounded-lg px-4 text-sm font-semibold ${plan.is_featured ? "bg-[#155ec8] text-white" : "border border-[#d9e3ef] text-[#29466c] hover:bg-[#f5f8fc]"}`}>{plan.price_php === 0 ? "Start free" : `Choose ${plan.name}`}<ArrowRight size={15}/></Link>
    </article>)}</section>
    {plans.length === 0 && <p className="mx-auto -mt-16 max-w-xl px-5 text-center text-sm text-[#66758a]">{unavailable ? "Pricing is temporarily unavailable while plan data is set up. Please check back soon." : "Plans are being updated. Please check back soon."}</p>}
    {plans.length > 0 && <>
    <section className="mx-auto max-w-6xl px-5 py-16 sm:px-8"><h2 className="text-center text-2xl font-bold">Compare plans</h2><div className="mt-7 overflow-x-auto rounded-xl border border-[#e2eaf4] bg-white"><table className="w-full min-w-[620px] text-left text-sm"><thead><tr><th className="p-4">Included</th>{plans.map(p=><th key={p.id} className={`p-4 text-center ${p.is_featured?"bg-[#f3f9ff]":""}`}>{p.name}</th>)}</tr></thead><tbody className="divide-y divide-[#edf1f6]"><tr><td className="p-4 text-[#66758a]">Price</td>{plans.map(p=><td key={p.id} className={`p-4 text-center font-semibold ${p.is_featured?"bg-[#f3f9ff]":""}`}>{money(Number(p.price_php))}</td>)}</tr><tr><td className="p-4 text-[#66758a]">Active cars</td>{plans.map(p=><td key={p.id} className={`p-4 text-center ${p.is_featured?"bg-[#f3f9ff]":""}`}>Up to {p.max_active_cars}</td>)}</tr><tr><td className="p-4 text-[#66758a]">Commission</td>{plans.map(p=><td key={p.id} className={`p-4 text-center ${p.is_featured?"bg-[#f3f9ff]":""}`}>{(p.commission_rate*100).toFixed(0)}%</td>)}</tr><tr><td className="p-4 text-[#66758a]">Dashboard and booking calendar</td>{plans.map(p=><td key={p.id} className={`p-4 text-center ${p.is_featured?"bg-[#f3f9ff]":""}`}>Included</td>)}</tr><tr><td className="p-4 text-[#66758a]">Support</td>{plans.map(p=><td key={p.id} className={`p-4 text-center ${p.is_featured?"bg-[#f3f9ff]":""}`}>{supportLabel[p.support_level] ?? p.support_level}</td>)}</tr></tbody></table></div>
      {standardBreakEven !== null && fleetBreakEven !== null && <p className="mt-4 text-center text-sm text-[#697b92]">Standard pays for itself at about {peso(standardBreakEven)} in monthly bookings; Fleet pays for itself vs Standard at about {peso(fleetBreakEven)}.</p>}
    </section>
    <section className="mx-auto grid max-w-6xl gap-8 px-5 pb-16 sm:grid-cols-2 sm:px-8"><div><h2 className="text-2xl font-bold">How paying for a plan works</h2><ol className="mt-5 space-y-4 text-sm leading-6 text-[#62738a]">{["Choose the plan that fits your fleet.","Pay the monthly plan fee by QR and send your transaction reference.","We verify the payment and activate your plan."] .map((step,i)=><li key={step} className="flex gap-3"><span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#e7f0ff] text-xs font-bold text-[#155ec8]">{i+1}</span>{step}</li>)}</ol></div><aside className="rounded-2xl bg-[#eaf3ff] p-6"><p className="text-xs font-bold uppercase tracking-wider text-[#37669e]">Booking example</p><h3 className="mt-2 text-xl font-bold">Three days at {peso(3000)} per day</h3>{example && <p className="mt-3 text-sm leading-6 text-[#516783]">With Starter, commission is {peso(example.commission)} and you keep <strong className="text-[#18385e]">{peso(example.earnings)}</strong>.</p>}</aside></section>
    <section className="mx-auto max-w-6xl px-5 pb-16 sm:px-8"><h2 className="text-center text-2xl font-bold">Pricing questions</h2><div className="mt-7 grid gap-4 sm:grid-cols-2">{[["What counts as an active car?","Only cars currently published and bookable count toward your plan limit."],["What happens when a plan ends?","There is a short grace period to renew. If the limit changes, extra listings are hidden and can be restored after renewal."],["Can I change plans?","Yes. Upgrade or downgrade when your fleet is ready for a change."],["Do customers pay anything extra?","No. Customers never pay a booking fee."]].map(([q,a])=><article key={q} className="rounded-xl border border-[#e4ebf4] bg-white p-5"><h3 className="font-semibold">{q}</h3><p className="mt-2 text-sm leading-6 text-[#6d7c90]">{a}</p></article>)}</div></section>
    </>}
    <section className="bg-[#0A47B1] px-5 py-12 text-center text-white"><h2 className="text-3xl font-bold">Ready to list your car?</h2><Link href="/apply" className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-lg bg-white px-5 text-sm font-semibold text-[#154f9e]">Apply to list your car<ArrowRight size={15}/></Link></section>
  </main>;
}
