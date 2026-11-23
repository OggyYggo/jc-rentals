import { publicMetadata } from "@/lib/site/public-metadata";
import { ApplyHeader } from "@/components/apply/ApplyHeader";
import { ApplyForm } from "@/components/apply/ApplyForm";
import { ApplySidebar } from "@/components/apply/ApplySidebar";
import { PublicFooter } from "@/components/public-footer";
import { ApplyPlanProvider } from "@/components/apply/ApplyPlanContext";
import { getPublicPlans } from "@/lib/plans/queries";

export const metadata = publicMetadata("/apply", "Apply to List Your Car",
  "Apply to list your vehicle for rent in Bohol. Tell us about yourself and your vehicle, and we’ll email you after reviewing your application.");
export const instant = false;
export default async function ApplyPage({ searchParams }: PageProps<"/apply">) {
  const [{ plans, unavailable }, params] = await Promise.all([getPublicPlans(), searchParams]);
  const requested = Array.isArray(params.plan) ? params.plan[0] : params.plan;
  const initialCode = requested && plans.some((plan) => plan.code === requested) ? requested : "starter";
  return <main className="theme-public min-h-screen bg-[#EAF4FF]"><ApplyHeader/><ApplyPlanProvider plans={plans} initialCode={initialCode} unavailable={unavailable}><div className="mx-auto grid max-w-[1440px] gap-8 px-5 pb-16 pt-16 lg:grid-cols-[minmax(0,1fr)_340px] lg:gap-10 lg:px-[140px] lg:pt-20"><ApplyForm/><ApplySidebar/></div></ApplyPlanProvider><PublicFooter/></main>;
}
