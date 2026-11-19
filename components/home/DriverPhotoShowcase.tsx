import { ParallaxImage } from "@/components/motion/ParallaxImage";
import { IdCard, MapPin, UserRound } from "lucide-react";
import Image from "next/image";
import tarsierPhoto from "@/img/Tarsier.jpg";
import lobocPhoto from "@/img/Loboc.jpg";
import panglaoPhoto from "@/img/Panglao.jpg";

function LocationPhoto({ src, alt, label, className = "" }: { src: typeof lobocPhoto; alt: string; label: string; className?: string }) {
  return (
    <div data-reveal-item className={`motion-caption relative overflow-hidden ${className}`}>
      <Image src={src} alt={alt} fill sizes="(min-width:1024px) 22vw, 50vw" className="object-cover" />
      <div className="absolute inset-0 bg-gradient-to-b from-transparent from-50% to-[#0F2342]/60" />
      <Pill>{label}</Pill>
    </div>
  );
}

function Pill({ children }: { children: React.ReactNode }) {
  return <span className="absolute bottom-3 left-3 inline-flex items-center gap-1.5 rounded-full bg-white/90 px-3 py-1.5 text-[13px] font-bold text-[#0A3D91]"><MapPin className="size-[15px]" aria-hidden="true" />{children}</span>;
}

export function DriverPhotoShowcase({ animate }: { animate: boolean }) {
  return (
    <div data-reveal-stagger className="grid grid-cols-2 gap-2.5 lg:h-[560px] lg:grid-cols-[1.3fr_1fr] lg:grid-rows-2 lg:gap-3.5">
      <div data-reveal-mask className="relative col-span-2 h-[250px] overflow-hidden rounded-[18px] bg-[#0A3D91] shadow-[0_24px_60px_rgba(11,99,206,.18)] lg:col-span-1 lg:row-span-2 lg:h-auto lg:rounded-3xl">
        {animate ? <ParallaxImage><Image src={tarsierPhoto} alt="A Philippine tarsier in Bohol" fill sizes="(min-width:1024px) 40vw, 100vw" className="object-cover" /></ParallaxImage> : <Image src={tarsierPhoto} alt="A Philippine tarsier in Bohol" fill sizes="(min-width:1024px) 40vw, 100vw" className="object-cover" />}
        <div className="absolute inset-0 bg-gradient-to-b from-transparent from-[38%] to-[#0F2342]/80" />
        <span className="absolute left-3.5 top-3.5 inline-flex items-center gap-2 rounded-full bg-white/90 px-3.5 py-2 text-sm font-bold text-[#0A3D91] lg:left-[18px] lg:top-[18px]"><IdCard className="size-[17px]" aria-hidden="true" />No license needed</span>
        <div className="absolute inset-x-3.5 bottom-3.5 flex items-center gap-3 rounded-[18px] bg-white p-3 shadow-[0_16px_40px_rgba(15,35,66,.25)] lg:inset-x-[18px] lg:bottom-[18px] lg:p-3.5">
          <span className="flex size-[42px] flex-none items-center justify-center rounded-full bg-[#0B63CE] text-white lg:size-12"><UserRound className="size-[22px] lg:size-[26px]" aria-hidden="true" /></span>
          <div className="min-w-0"><p className="font-heading text-[15px] font-bold leading-[21px] text-[#0F2342] lg:text-base">Local driver included</p><p className="text-[13px] leading-[19px] text-[#51657F]">Knows the way and the best stops.</p></div>
        </div>
      </div>
      <LocationPhoto src={lobocPhoto} alt="Loboc River in Bohol" label="Loboc River" className="h-[130px] rounded-[18px] lg:h-auto lg:rounded-3xl" />
      <LocationPhoto src={panglaoPhoto} alt="Panglao beach in Bohol" label="Panglao beach" className="h-[130px] rounded-[18px] lg:h-auto lg:rounded-3xl" />
    </div>
  );
}
