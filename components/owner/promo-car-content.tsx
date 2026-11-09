import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { ArrowLeft, CarFront } from "lucide-react";
import { PageHeading } from "@/components/owner/ui";
import { PromoSharePanel } from "@/components/owner/promo-share-panel";
import { loadCarForPromo } from "@/lib/promo/data";
import { carShortUrl } from "@/lib/promo/qr";
import { getCurrentOrigin } from "@/lib/promo/origin";

function peso(value: number) {
  return new Intl.NumberFormat("en-PH", { maximumFractionDigits: 0 }).format(value);
}

export async function PromoCarContent({ carId, backHref = "/owner/promote" }: { carId: string; backHref?: string }) {
  await connection();
  const car = await loadCarForPromo(carId);
  if (!car) notFound();
  const rates = car.rates.filter((rate) => rate.mode === "self_drive" ? car.allows_self_drive : car.allows_with_driver);
  const selfRate = rates.find((rate) => rate.mode === "self_drive");
  const driverRate = rates.find((rate) => rate.mode === "with_driver");
  const origin = await getCurrentOrigin();
  const link = car.short_code ? carShortUrl(car.short_code, "share", origin) : "";
  const carName = `${car.year ? `${car.year} ` : ""}${car.brand} ${car.model}`;
  const modes = [selfRate ? `Self-drive from ₱${peso(Number(selfRate.daily_rate))}/day` : null, driverRate ? `with driver from ₱${peso(Number(driverRate.daily_rate))}/day` : null].filter(Boolean);
  const captions = [
    { label: "Short", text: `${carName} for rent in Bohol. ${modes.join(" and ")}. Book here: ${link}` },
    { label: "Detailed", text: `Planning a Bohol trip? Rent the ${carName}: ${modes.join(" or ")}. Check dates and request a booking online: ${link}` },
    ...(driverRate ? [{ label: "With driver", text: `Explore Chocolate Hills, Loboc River and Panglao with a local driver. ${carName} with driver from ₱${peso(Number(driverRate.daily_rate))}/day. Book online: ${link}` }] : []),
  ];
  const templates = [
    { name: "Square post", size: "1080 × 1080", route: "post", output: "PNG" as const },
    { name: "Story", size: "1080 × 1920", route: "story", output: "PNG" as const },
    { name: "Facebook cover", size: "1640 × 624", route: "cover", output: "PNG" as const },
    { name: "A4 poster", size: "2480 × 3508 · 300 dpi", route: "poster", output: "PDF" as const },
    { name: "A6 car sticker", size: "1240 × 1748 · 300 dpi", route: "sticker", output: "PDF" as const },
  ].map((item) => ({ ...item, previewUrl: `/api/promo/${encodeURIComponent(car.id)}/${item.route}`, downloadUrl: `/api/promo/${encodeURIComponent(car.id)}/${item.route}?download=1` }));

  return <>
    <Link href={backHref} className="mb-4 inline-flex items-center gap-2 text-[11px] font-semibold text-[#4b6dc4]"><ArrowLeft size={14}/>All rentals</Link>
    <PageHeading eyebrow="Promo kit" title={`Promote ${carName}`} description="Copy your link, share it directly, or download branded posts and print artwork with a QR code that opens this car page."/>
    <div className="mb-5 grid gap-4 rounded-xl border border-[#e7ecf3] bg-white p-4 sm:grid-cols-[180px_1fr] sm:items-center sm:p-5">
      <div className="relative aspect-[4/3] overflow-hidden rounded-lg bg-[#edf2ff]">{car.photoUrl ? <Image src={car.photoUrl} alt={carName} fill unoptimized sizes="180px" className="object-cover"/> : <div className="flex h-full items-center justify-center text-[#6680c8]"><CarFront size={34}/></div>}</div>
      <div><h2 className="text-sm font-semibold text-[#33445b]">{carName}</h2><p className="mt-1 text-[10px] text-[#8793a3]">{[car.car_type, car.seats ? `${car.seats} seats` : null, car.transmission].filter(Boolean).join(" · ")}</p><div className="mt-3 flex flex-wrap gap-2">{rates.map((rate) => <span key={rate.mode} className="rounded-full bg-[#edf2ff] px-2.5 py-1 text-[10px] font-semibold text-[#4567be]">{rate.mode === "self_drive" ? "Self-drive" : "With driver"} · ₱{peso(Number(rate.daily_rate))}/day</span>)}</div></div>
    </div>
    {car.short_code ? <PromoSharePanel assets={templates} carName={carName} link={link} businessName={car.owner?.business_name || "your business"} captions={captions}/> : <div className="rounded-xl border border-[#f0dfb9] bg-[#fffaf0] p-4 text-xs leading-5 text-[#8a6524]">Apply the promo kit database migration to create this car’s permanent short link before sharing it.</div>}
  </>;
}
