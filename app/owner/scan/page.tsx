import { PageHeading } from "@/components/owner/ui";
import { PickupScanner } from "@/components/owner/PickupScanner";
import { pickupOrigins } from "@/lib/pickup/origin";

export const instant = false;

export default async function OwnerScanPage() {
  const origins = await pickupOrigins();
  return <section className="mx-auto max-w-lg" aria-label="Pickup scanner">
    <div className="mb-4 lg:hidden">
      <h1 className="text-[25px] font-bold leading-tight tracking-tight text-[#163052]">Scan pickup pass</h1>
      <p className="mt-1 text-sm leading-5 text-[#52647d]">Ask the customer to show their pickup pass.</p>
    </div>
    <div className="hidden lg:block"><PageHeading title="Scan pickup pass" description="Scan the customer’s QR or enter their backup code."/></div>
    <PickupScanner origins={origins} />
  </section>;
}
