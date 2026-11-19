import { DrawCheck } from "@/components/motion/DrawCheck";
import { Reveal } from "@/components/motion/Reveal";
import Link from "next/link";
import { Suspense } from "react";
import { Mail, FileText, CarFront, Star } from "lucide-react";
import { getApplicationEmail, getApplicationPlanSummary } from "@/app/apply/actions";
import { PublicFooter } from "@/components/public-footer";

export const metadata = { title: "Application received | Kuyog Bohol" };
async function ApplicantEmail() { return <strong className="break-all text-[#0F2342]">{(await getApplicationEmail()) ?? "your email"}</strong>; }
async function ChosenPlanCard() {
  const details = await getApplicationPlanSummary();
  const plan = details?.plan;
  if (!plan) return null;
  const starter = plan.code === "starter";
  return <article className="mx-auto mt-6 max-w-lg rounded-2xl border border-[#D6E6F7] bg-[#F3F9FF] p-5 text-left">
    <div className="flex gap-3"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white text-[#0B63CE]"><Star size={20}/></span><div><h2 className="font-semibold text-[#0F2342]">Your chosen plan: {plan.name}</h2>
      <p className="mt-1 text-sm leading-5 text-[#51657F]">{starter ? "You are starting on the Starter plan. You can upgrade any time after approval." : `You pay nothing now. After we approve you, open Plan in your owner dashboard to pay and activate it. Until then, you start on Starter${details?.starterMaxVehicles ? ` (${details.starterMaxVehicles} vehicles)` : ""}.`}</p>
    </div></div>
  </article>;
}
export default function ApplyReceivedPage() {
  const steps = [[Mail, "Check your inbox", "Look for our confirmation email. Check spam if you do not see it."], [FileText, "We review your application", "This is when we check your photos and documents."], [CarFront, "Set up your owner account", "If approved, we email you a link to set your password. You start on Starter, or pay to activate the plan you chose."]] as const;
  return <main className="theme-public flex min-h-[70vh] flex-1 flex-col bg-[#EAF4FF]"><div className="mx-auto flex w-full max-w-[1440px] flex-1 items-center justify-center px-5 py-14 lg:px-[140px]"><Reveal as="section" className="w-full max-w-[760px] rounded-[28px] border border-[#D6E6F7] bg-white px-6 py-10 text-center shadow-[0_25px_70px_rgba(10,61,145,.12)] sm:px-12 sm:py-14"><div className="mx-auto grid h-[84px] w-[84px] place-items-center rounded-full bg-[#EAF4FF]"><span className="grid h-[60px] w-[60px] place-items-center rounded-full bg-[#0B63CE] text-white"><DrawCheck /></span></div><h1 className="mt-6 font-heading text-3xl font-bold text-[#0F2342] sm:text-[38px]">Application received</h1><p className="mx-auto mt-3 max-w-xl text-base leading-7 text-[#51657F]">Thank you. We sent a confirmation to <Suspense fallback={<strong>your email</strong>}><ApplicantEmail/></Suspense>. We will review your application and reply by email.</p><div data-reveal-stagger data-reveal-delay="0.6" className="mx-auto mt-8 max-w-lg space-y-4 text-left">{steps.map(([Icon,title,text])=><div data-reveal-item key={title} className="flex gap-3 rounded-xl bg-[#F3F9FF] p-4"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-white text-[#0B63CE]"><Icon size={19}/></span><div><h2 className="text-sm font-semibold text-[#0F2342]">{title}</h2><p className="mt-1 text-sm leading-5 text-[#51657F]">{text}</p></div></div>)}</div><Suspense fallback={null}><ChosenPlanCard/></Suspense><div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row"><Link href="/" className="inline-flex h-12 items-center justify-center rounded-full bg-[#0B63CE] px-7 text-sm font-semibold text-white hover:bg-[#0A3D91]">Back to home</Link><Link href="/contact" className="inline-flex h-12 items-center justify-center rounded-full border border-[#D6E6F7] bg-white px-7 text-sm font-semibold text-[#0B63CE] hover:bg-[#F3F9FF]">Contact us</Link></div></Reveal></div><PublicFooter/></main>;
}
