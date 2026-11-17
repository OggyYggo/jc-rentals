import type { Metadata } from "next";
import { OwnerApplicationForm } from "@/components/owner/owner-application-form";

export const metadata: Metadata = {
  title: "Apply to List Your Car | Kuyog Bohol",
  description: "Apply to offer your car for rent in Bohol.",
};

export default function ApplyPage() {
  return <main className="min-h-screen bg-[#f6f9fd] px-5 py-12 text-[#26364e] sm:px-8 sm:py-16"><div className="mx-auto max-w-3xl">
    <p className="text-xs font-semibold uppercase tracking-wide text-[#2457d6]">Kuyog Bohol owner application</p>
    <h1 className="mt-2 text-3xl font-semibold sm:text-4xl">Apply to list your car</h1>
    <p className="mt-3 max-w-2xl text-sm leading-6 text-[#68778c]">Tell us about you and your car. We review every application and email you with the result.</p>
    <div className="my-7 grid gap-3 rounded-xl border border-[#dfe7f2] bg-white p-4 text-xs sm:grid-cols-3">{["1. Send your application", "2. We review it", "3. Set up your account and start earning"].map((step)=><p key={step} className="font-medium text-[#53637a]">{step}</p>)}</div>
    <p className="mb-5 text-xs text-[#68778c]">We review every application to keep Kuyog Bohol safe for customers.</p>
    <OwnerApplicationForm />
  </div></main>;
}
