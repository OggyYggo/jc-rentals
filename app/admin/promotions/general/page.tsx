import { PromoSharePanel } from "@/components/owner/promo-share-panel";
import { getAdminContext } from "@/lib/admin-context";
import { getCurrentOrigin } from "@/lib/promo/origin";
import { PageHeading } from "@/components/owner/ui";

export const instant = false;

export default async function AdminGeneralPromoPage() {
  await getAdminContext();
  const link = `${await getCurrentOrigin()}/`;
  const captions = [
    { label: "Short", text: `Planning a Bohol trip? Browse local cars for self-drive or with a driver. Book online: ${link}` },
    { label: "Detailed", text: `Explore Bohol your way. Find local rentals for self-drive or a ride with a local driver, check dates, and book online with Kuyog Bohol: ${link}` },
  ];
  return <><PageHeading eyebrow="Kuyog Bohol brand kit" title="General brand post" description="Share the site and help travelers find all active rentals."/><PromoSharePanel assets={[{ name: "General brand post", size: "1080 × 1080", output: "PNG", previewUrl: "/api/promo/general/post", downloadUrl: "/api/promo/general/post?download=1" }]} carName="Kuyog Bohol car rentals" link={link} businessName="Kuyog Bohol" captions={captions}/></>;
}
