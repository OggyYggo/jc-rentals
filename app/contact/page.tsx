import Link from "next/link";
import type { Metadata } from "next";
import { ArrowLeft, CarFront } from "lucide-react";
import { OwnerApplicationForm } from "@/components/owner/owner-application-form";

export const metadata: Metadata = {
  title: "Apply to List Your Car | Kuyog Bohol",
  description: "Send Kuyog Bohol your car and business details to apply as a local rental partner.",
};

export default function ContactPage() {
  return <main className="min-h-[70vh] bg-[#f6f9fd] px-5 py-12 sm:px-8 sm:py-16">
    <div className="mx-auto max-w-3xl">
      <Link href="/for-owners" className="inline-flex items-center gap-2 text-sm font-medium text-[#2457d6]"><ArrowLeft size={15}/>For car owners</Link>
      <div className="mt-6 flex items-center gap-3"><span className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#eaf1ff] text-[#2457d6]"><CarFront size={22}/></span><div><p className="text-xs font-semibold uppercase tracking-wide text-[#63738b]">Kuyog Bohol partner application</p><h1 className="mt-1 text-2xl font-semibold text-[#26364e] sm:text-3xl">Apply to list your car</h1></div></div>
      <p className="mb-6 mt-4 max-w-2xl text-sm leading-6 text-[#68778c]">Tell us about your business and vehicle. Our team will review your application and contact you about setting up an owner account.</p>
      <OwnerApplicationForm />
    </div>
  </main>;
}
