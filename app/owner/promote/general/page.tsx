import { PageHeading } from "@/components/owner/ui";
import { PromoSharePanel } from "@/components/owner/promo-share-panel";
import { getOwnerContext } from "@/lib/owner-context";
import { getCurrentOrigin } from "@/lib/promo/origin";

export const instant = false;

export default async function GeneralPromoPage() {
  const { owner } = await getOwnerContext();
  const link = `${await getCurrentOrigin()}/`;
  const captions = [
    { label: "Short", text: `Planning a Bohol trip? Browse local cars for self-drive or with a driver. Book online: ${link}` },
    { label: "Detailed", text: `Explore Bohol your way. Find local rentals for self-drive or a ride with a local driver, check dates, and book online with Kuyog Bohol: ${link}` },
  ];

  return <>
    <PageHeading eyebrow="Kuyog Bohol brand kit" title="Promote car rentals in Bohol" description="Share a general branded post that helps travelers browse all active cars on Kuyog Bohol."/>
    <PromoSharePanel assets={[{ name: "General brand post", size: "1080 × 1080", output: "PNG", previewUrl: "/api/promo/general/post", downloadUrl: "/api/promo/general/post?download=1" }]} carName="Kuyog Bohol car rentals" link={link} businessName={owner.business_name} captions={captions}/>
  </>;
}
