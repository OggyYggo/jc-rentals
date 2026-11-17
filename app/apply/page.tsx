import type { Metadata } from "next";
import { ApplyHeader } from "@/components/apply/ApplyHeader";
import { ApplyForm } from "@/components/apply/ApplyForm";
import { ApplySidebar } from "@/components/apply/ApplySidebar";
import { PublicFooter } from "@/components/public-footer";

export const metadata: Metadata = { title: "Apply to List Your Car | Kuyog Bohol", description: "Apply to offer your car for rent in Bohol. No account needed." };
export default function ApplyPage() {
  return <main className="theme-public min-h-screen bg-[#EAF4FF]"><ApplyHeader/><div className="mx-auto grid max-w-[1440px] gap-8 px-5 pb-16 pt-16 lg:grid-cols-[minmax(0,1fr)_340px] lg:gap-10 lg:px-[140px] lg:pt-20"><ApplyForm/><ApplySidebar/></div><PublicFooter/></main>;
}
