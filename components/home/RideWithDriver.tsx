import { Reveal } from "@/components/motion/Reveal";
import Link from "next/link";
import { ArrowRight, IdCard, MapPin, Sun, Users } from "lucide-react";
import { DriverPhotoShowcase } from "./DriverPhotoShowcase";
import { carsUrl } from "@/lib/cars/searchParams";

const benefits = [
  { icon: IdCard, title: "No license needed", text: "Book a driver and just enjoy the ride." },
  { icon: MapPin, title: "Knows the roads", text: "Local drivers know the best stops and the shortest way." },
  { icon: Sun, title: "Relax and enjoy the view", text: "No maps, no parking, no stress. Just Bohol." },
  { icon: Users, title: "Great for families and groups", text: "Everyone rides together in one car." },
];

export function RideWithDriver({ lowestDriverPrice, animate = true }: { lowestDriverPrice: number | null; animate?: boolean }) {
  const Content = animate ? Reveal : "div";
  return (
    <section id="trips" className="scroll-mt-24 bg-[#F5FAFF] py-14 lg:py-24" aria-labelledby="driver-heading">
      <Content className="mx-auto max-w-[1440px] px-5 lg:px-[140px]">
        <div className="grid items-center gap-8 lg:grid-cols-2 lg:gap-[72px]">
          <DriverPhotoShowcase animate={animate} />
          <div data-reveal>
            <p className="text-xs font-semibold tracking-[2px] text-[#0B63CE] lg:text-[13px]">RIDE WITH A LOCAL DRIVER</p>
            <h2 id="driver-heading" className="mt-3 font-heading text-[32px] font-bold leading-[38px] tracking-tight text-[#0F2342] lg:text-[44px] lg:leading-[52px]">Sit back. Let a local show you Bohol.</h2>
            <p className="mt-4 max-w-[520px] text-base leading-[25px] text-[#51657F] lg:text-lg lg:leading-7">No license, no maps, no parking stress. Pick a car with a driver and spend your day looking at the view instead of the road.</p>
            <ul className="mt-7 flex flex-col gap-[18px] lg:mt-8 lg:gap-5">
              {benefits.map(({ icon: Icon, title, text }) => <li key={title} className="flex items-start gap-3.5 lg:gap-4"><span className="flex size-11 flex-none items-center justify-center rounded-[14px] bg-[#EAF4FF] text-[#0B63CE] lg:size-12"><Icon className="size-[22px] lg:size-6" aria-hidden="true" /></span><div><p className="font-heading text-base font-bold leading-[22px] text-[#0F2342] lg:text-lg lg:leading-6">{title}</p><p className="mt-0.5 text-sm leading-[21px] text-[#51657F] lg:text-[15px] lg:leading-[23px]">{text}</p></div></li>)}
            </ul>
            <div className="mt-7 flex flex-col gap-3 lg:mt-9 lg:flex-row lg:items-center lg:gap-7">
              {lowestDriverPrice != null && <p className="text-center text-[15px] text-[#51657F] lg:order-2 lg:text-left">With driver from <b className="text-[#0F2342]">₱{lowestDriverPrice.toLocaleString()} / day</b></p>}
              <Link href={carsUrl({ mode: "driver" })} className="inline-flex h-14 w-full items-center justify-center gap-2.5 rounded-full bg-[#0B63CE] px-9 text-[17px] font-bold text-white hover:bg-[#0A3D91] lg:order-1 lg:w-auto">Find a car with driver <ArrowRight className="size-[18px]" aria-hidden="true" /></Link>
            </div>
            <Link href={carsUrl({ mode: "self" })} className="mt-4 flex justify-center text-[15px] font-semibold text-[#0B63CE] hover:underline lg:inline-flex lg:justify-start">Prefer to drive yourself? See self-drive cars →</Link>
          </div>
        </div>
      </Content>
    </section>
  );
}
