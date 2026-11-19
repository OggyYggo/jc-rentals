"use client";

import { useRef } from "react";
import { ShieldCheck } from "lucide-react";
import { useApplyPlan } from "@/components/apply/ApplyPlanContext";
import { peso } from "@/lib/plans/breakEven";

export function PlanPicker() {
  const { plans, selectedCode, setSelectedCode, unavailable } = useApplyPlan();
  const buttons = useRef<Array<HTMLButtonElement | null>>([]);
  const visiblePlans = unavailable ? [] : plans.filter((plan) => ["starter", "standard", "fleet"].includes(plan.code));

  function onKeyDown(event: React.KeyboardEvent<HTMLButtonElement>, index: number) {
    let next = index;
    if (event.key === "ArrowRight" || event.key === "ArrowDown") next = (index + 1) % Math.max(visiblePlans.length, 1);
    else if (event.key === "ArrowLeft" || event.key === "ArrowUp") next = (index - 1 + visiblePlans.length) % visiblePlans.length;
    else return;
    event.preventDefault();
    const target = visiblePlans[next];
    if (!target) return;
    setSelectedCode(target.code);
    buttons.current[next]?.focus();
  }

  return <>
    <div id="choose-plan" className="scroll-mt-6" role="radiogroup" aria-label="Plan">
      <div className="grid gap-4 md:grid-cols-3">
        {visiblePlans.map((plan, index) => {
          const selected = selectedCode === plan.code;
          return <button key={plan.id} ref={(node) => { buttons.current[index] = node; }} type="button" role="radio" aria-checked={selected} aria-label={`${plan.name} plan, ${Number(plan.price_php) === 0 ? "free" : `${peso(Number(plan.price_php))} a month`}, up to ${plan.max_active_cars} cars, ${Number(plan.commission_rate * 100)} percent commission`} tabIndex={selected ? 0 : -1} onClick={() => setSelectedCode(plan.code)} onKeyDown={(event) => onKeyDown(event, index)} className={`relative flex h-full min-h-[210px] flex-col rounded-[18px] border-2 p-5 text-left transition-colors duration-150 motion-reduce:transition-none focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-offset-[3px] focus-visible:outline-[#2E9BF0] ${selected ? "border-[#0B63CE] bg-[#F3F9FF]" : "border-[#D6E6F7] bg-white hover:border-[#0B63CE]"}`}>
            {plan.is_featured && <span className="absolute -top-3 right-4 whitespace-nowrap rounded-full bg-[#0B63CE] px-3 py-1 text-[11px] font-bold tracking-[1.2px] text-white">MOST POPULAR</span>}
            <span className="flex items-center gap-3"><span aria-hidden className={`grid h-5 w-5 shrink-0 place-items-center rounded-full border-2 ${selected ? "border-[#0B63CE]" : "border-[#B7CDE6]"}`}>{selected && <span className="h-1.5 w-1.5 rounded-full bg-[#0B63CE]"/>}</span><span className="font-heading text-lg font-bold text-[#0F2342]">{plan.name}</span></span>
            <span className="mt-4 flex items-baseline gap-1"><span className="font-heading text-[30px] font-extrabold leading-none text-[#0A3D91]">{Number(plan.price_php) === 0 ? "Free" : peso(Number(plan.price_php))}</span>{Number(plan.price_php) !== 0 && <span className="text-sm text-[#51657F]">/ month</span>}</span>
            <span className="mt-4 flex flex-wrap gap-2"><span className="whitespace-nowrap rounded-full bg-[#EAF4FF] px-3 py-1.5 text-[13px] font-semibold text-[#0A3D91]">Up to {plan.max_active_cars} cars</span><span className="whitespace-nowrap rounded-full bg-[#EAF4FF] px-3 py-1.5 text-[13px] font-semibold text-[#0A3D91]">{Number(plan.commission_rate * 100)}% commission</span></span>
            <span className="mt-4 text-sm leading-5 text-[#51657F]">{plan.tagline}</span>
          </button>;
        })}
        {unavailable && <button type="button" role="radio" aria-checked="true" aria-label="Starter plan. Plan details unavailable." className="flex min-h-[210px] flex-col rounded-[18px] border-2 border-[#0B63CE] bg-[#F3F9FF] p-5 text-left focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-offset-[3px] focus-visible:outline-[#2E9BF0]"><span className="font-heading text-lg font-bold text-[#0F2342]">Starter</span><span className="mt-4 text-sm text-[#51657F]">Plan options are temporarily unavailable. You can still submit your application on Starter.</span></button>}
      </div>
    </div>
    {unavailable && <p className="mt-3 text-xs text-[#6b7b90]">Plan details could not be loaded. Your application will use Starter.</p>}
    {!unavailable && <div className="mt-5 flex gap-3 rounded-2xl bg-[#EAF4FF] p-4 text-sm text-[#31516f]"><ShieldCheck size={20} className="mt-0.5 shrink-0 text-[#0B63CE]"/><p><strong className="block text-[#0F2342]">You pay nothing now.</strong>If you pick a paid plan, you pay only after we approve your application. You can change your plan any time. <a href="/pricing" target="_blank" rel="noopener" className="ml-1 font-semibold text-[#0B63CE] underline">Compare plans</a></p></div>}
  </>;
}
