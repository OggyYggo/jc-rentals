import { StaffWorkspace } from "@/components/staff/workspace";
import { PickupScanner } from "@/components/owner/PickupScanner";
import { pickupOrigins } from "@/lib/pickup/origin";

export const instant = false;

export default async function StaffScan({ searchParams }: PageProps<"/staff/scan">) {
  const [{ business }, origins] = await Promise.all([searchParams,pickupOrigins()]);
  return <StaffWorkspace view="scan" requested={typeof business === "string" ? business : undefined}
    scanner={selected => <PickupScanner key={selected.owner_id} origins={origins} staff={selected} />} />;
}
