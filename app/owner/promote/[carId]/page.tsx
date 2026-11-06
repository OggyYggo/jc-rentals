import { PromoCarContent } from "@/components/owner/promo-car-content";

export const instant = false;

export default async function PromoteCarPage({ params }: { params: Promise<{ carId: string }> }) {
  const { carId } = await params;
  return <PromoCarContent carId={carId}/>;
}
