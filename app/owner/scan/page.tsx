import { PageHeading } from "@/components/owner/ui";
import { PickupScanner } from "@/components/owner/PickupScanner";
import { pickupOrigins } from "@/lib/pickup/origin";

export const instant = false;

export default async function OwnerScanPage() {
  const origins = await pickupOrigins();
  return <main className="mx-auto max-w-lg">
    <PageHeading title="Scan pickup pass" description="Scan the customer’s QR or enter their backup code."/>
    <PickupScanner origins={origins} />
  </main>;
}
