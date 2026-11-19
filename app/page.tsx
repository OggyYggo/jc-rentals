import { HeroIntro } from "@/components/motion/HeroIntro";
import { Reveal } from "@/components/motion/Reveal";
import Link from "next/link";
import Image from "next/image";
import heroBackground from "@/img/bg.jpg";
import mascot from "@/img/mascot.png";
import { Suspense } from "react";
import { io } from "next/cache";
import { CarFront, ShieldCheck, Wallet, FileText, Users, CircleDollarSign, ArrowRight, Headphones, CalendarCheck, MessageSquare, BadgeCheck, Sparkles, type LucideIcon } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/shared";
import { SearchForm } from "@/components/customer/search-form";
import { CarTile } from "@/components/customer/car-tile";
import { Logo } from "@/components/logo";
import { CurrentYear } from "@/components/current-year";
import { RideWithDriver } from "@/components/home/RideWithDriver";
import { FindCarLink } from "@/components/home/FindCarLink";
import { FeaturedCarsGrid } from "@/components/home/FeaturedCarsGrid";

export const metadata = { title: "Kuyog Bohol: Car and Motorcycle Rental in Bohol, Self-Drive and With Driver", description: "Rent a car or motorcycle in Bohol from local owners. Choose self-drive or a car with a driver. Book online in minutes." };
const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL || "https://kuyogbohol.com").replace(/\/$/, "");
const organizationJsonLd = {
  "@context": "https://schema.org",
  "@type": "Organization",
  name: "Kuyog Bohol",
  url: siteUrl,
  logo: `${siteUrl}/icon-512.png`,
};
const steps = [
  { Icon: CalendarCheck, title: "Choose your vehicle", desc: "Pick your dates, Self-drive or With driver, and a car." },
  { Icon: BadgeCheck, title: "Pay a small deposit", desc: "Scan the QR and upload your proof of payment." },
  { Icon: MessageSquare, title: "Pick up and go", desc: "Meet the owner or driver, pay the balance, and enjoy Bohol." },
];
const faq = [
  ["What do I need to rent self-drive?", "A valid driver's license, a valid ID, and a small deposit to book."],
  ["Can I book with a driver instead?", "Yes. You do not need a driver's license for a booking with a driver."],
  ["How do I pay?", "Pay a small deposit by QR to confirm your booking. You pay the balance to the owner at pickup."],
  ["What if I need to cancel?", "You can cancel from My bookings before your start date while the booking is still pending. See the cancellation policy for details."],
  ["Is fuel included?", "It depends on the listing. Fuel terms are shown on each car page."],
  ["Where do I pick up?", "Pickup details are shown on the car page and confirmed after booking."],
];
const trustItems: [LucideIcon, string][] = [
  [ShieldCheck, "Verified local owners"],
  [Wallet, "Clear prices, no hidden fees"],
  [CarFront, "Small deposit to book"],
  [FileText, "Documents kept private"],
];
const perks: [LucideIcon, string, string][] = [
  [Users, "Local owners", "Vehicles come from owners based right here in Bohol."],
  [CarFront, "Two ways to travel", "Drive yourself or ride with a local driver."],
  [CircleDollarSign, "Clear pricing", "See exactly what is included before you book — no surprises."],
  [ShieldCheck, "Private documents", "Your license and ID are stored securely and only shared when needed."],
];

export default function Home({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  return <main className="theme-public overflow-hidden bg-white text-[#0F2342]">
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationJsonLd).replace(/</g, "\\u003c") }} />
    {/* Hero */}
    <HeroIntro as="section" id="top" className="public-hero relative flex flex-col justify-center px-5 pb-32 pt-16 sm:px-8 md:min-h-[560px] md:pb-36 md:pt-24">
      <Image src={heroBackground} alt="The Chocolate Hills in Bohol" fill priority sizes="100vw" className="object-cover object-center"/>
      <div aria-hidden="true" className="absolute inset-0 bg-gradient-to-b from-[#0F2342]/80 via-[#0A3D91]/35 to-[#0F2342]/5 md:bg-[#0F2342]/60"/>
      <div aria-hidden="true" className="absolute inset-0 bg-[#0A3D91]/15"/>
      <div className="relative z-10 mx-auto w-full max-w-6xl text-center text-white">
        <span data-intro className="inline-flex items-center gap-2 rounded-full border border-white/35 bg-white/10 px-4 py-2 text-[13px] font-semibold uppercase tracking-[0.15em] backdrop-blur-md">CAR & MOTORCYCLE RENTAL IN BOHOL</span>
        <h1 data-intro className="mx-auto mt-6 max-w-[900px] text-[46px] font-semibold leading-[1.04] tracking-tight md:text-6xl lg:text-[76px]">Rent a car or motorcycle in Bohol.</h1>
        <p data-intro className="mx-auto mt-5 max-w-2xl text-[17px] leading-7 text-white/90 md:text-xl">Choose a self-drive car, a car with a driver, or a self-drive motorcycle. Book in minutes.</p>
        <div className="mx-auto mt-8 grid max-w-[300px] grid-cols-2 justify-center gap-x-5 gap-y-3 text-left text-sm font-semibold text-white/95 sm:flex sm:max-w-none sm:flex-wrap sm:gap-x-8 sm:text-center">
          <span data-intro-trust className="flex items-center gap-2"><Users size={20} strokeWidth={1.8}/> Local owners</span>
          <span data-intro-trust className="flex items-center gap-2"><CircleDollarSign size={20} strokeWidth={1.8}/> Clear pricing</span>
          <span data-intro-trust className="flex items-center gap-2"><ShieldCheck size={20} strokeWidth={1.8}/> Secure booking</span>
          <span data-intro-trust className="flex items-center gap-2"><Headphones size={20} strokeWidth={1.8}/> 24/7 support</span>
        </div>
      </div>
      <SearchForm />
    </HeroIntro>

    {/* Trust strip */}
    <section className="border-b border-[#D6E6F7] bg-[#EAF4FF] px-5 py-10 sm:px-8">
      <div className="mx-auto grid max-w-7xl grid-cols-2 items-center justify-items-center gap-x-5 gap-y-6 text-xs font-medium text-[#0F2342] sm:flex sm:flex-wrap sm:justify-center sm:gap-x-10 sm:text-sm md:gap-x-14">
        {trustItems.map(([Icon,label])=><span className="flex items-center gap-3" key={label}><span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-white text-[#0B63CE]"><Icon size={20} strokeWidth={1.8}/></span>{label}</span>)}
      </div>
    </section>

    <Suspense fallback={<RideWithDriver lowestDriverPrice={null} animate={false} />}><RideWithDriverData /></Suspense>

    <Suspense fallback={<FeaturedCarsFallback mode="all"/>}><FeaturedCarsForQuery searchParams={searchParams}/></Suspense>

    {/* How it works */}
    <Reveal as="section" id="how" className="scroll-mt-24 relative overflow-hidden bg-[#0A47B1] px-5 py-16 sm:px-8 md:py-24">
      <div aria-hidden="true" className="absolute -left-32 top-0 h-96 w-96 rounded-full bg-[#2E9BF0]/20 blur-3xl"/>
      <div aria-hidden="true" className="absolute -bottom-32 right-0 h-96 w-96 rounded-full bg-[#0B63CE]/25 blur-3xl"/>
      <div className="relative mx-auto grid max-w-6xl items-center gap-6 xl:grid-cols-[420px_minmax(0,1fr)] xl:gap-10">
        <div className="relative order-last mx-auto h-[390px] w-[220px] xl:order-first xl:mb-[-96px] xl:h-[700px] xl:w-full">
          <Image src={mascot} alt="Kuyog Bohol mascot" fill sizes="(min-width: 1280px) 420px, 220px" className="object-contain object-bottom" />
        </div>
        <div className="xl:col-start-2 xl:row-start-1">
        <p className="mb-3 text-center text-xs font-semibold uppercase tracking-[0.18em] text-[#CFE6FB] xl:text-left">How it works</p>
        <h2 className="text-center text-3xl font-bold tracking-tight text-white xl:text-left xl:text-[44px]">BOOK IN THREE STEPS</h2>
        <div data-reveal-stagger className="mt-8 grid gap-4">
          <span data-reveal-line aria-hidden="true" className="h-px w-full origin-left bg-white/35" />
          {steps.map(({Icon,title,desc},i)=><article data-reveal-item className="relative flex min-h-[118px] items-center gap-4 overflow-hidden rounded-[20px] border border-white/25 bg-white/10 p-5 text-left backdrop-blur-sm sm:gap-5 sm:px-6" key={title}>
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-white text-[#0A47B1]"><Icon size={23} strokeWidth={1.8}/></div>
            <div className="relative z-10 min-w-0 pr-10 sm:pr-16">
              <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#CFE6FB]">Step 0{i+1}</p><h3 className="mt-1 text-lg font-semibold text-white">{title}</h3>
              <p className="mt-1 max-w-[480px] text-sm leading-5 text-white/75">{desc}</p>
            </div>
            <span aria-hidden="true" className="absolute right-4 top-1/2 -translate-y-1/2 text-5xl font-bold text-white/20 sm:right-6 sm:text-6xl">0{i+1}</span>
          </article>)}
        </div>
        <FindCarLink />
        </div>
      </div>
    </Reveal>

    {/* Why book */}
    <Reveal as="section" id="faq" className="bg-[#F5FAFF] px-5 py-16 sm:px-8 md:py-24">
      <div className="mx-auto max-w-6xl">
        <p className="mb-3 text-center text-xs font-semibold uppercase tracking-[0.18em] text-[#0B63CE]">Why Kuyog Bohol</p>
        <h2 className="text-center text-3xl font-bold tracking-tight text-[#0F2342] md:text-4xl">Rent the right vehicle the easy way</h2>
        <div data-reveal-stagger className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {perks.map(([Icon,title,desc])=><article data-reveal-item key={title} className="public-card rounded-2xl border border-[#D6E6F7] bg-white p-6"><div className="mb-5 flex h-11 w-11 items-center justify-center rounded-xl bg-[#EAF4FF] text-[#0B63CE]"><Icon size={22} strokeWidth={1.8}/></div><h3 className="font-semibold text-[#0F2342]">{title}</h3><p className="mt-2 text-sm leading-6 text-[#51657F]">{desc}</p></article>)}
        </div>
      </div>
    </Reveal>

    {/* Owner CTA */}
    <Reveal as="section" id="owners-band" className="scroll-mt-24 bg-white px-5 py-16 sm:px-8 md:py-20">
      <div className="relative mx-auto max-w-6xl overflow-hidden rounded-3xl bg-[#0A3D91] px-7 py-12 text-center text-white sm:px-12 md:py-16">
        <div aria-hidden="true" className="absolute -right-20 -top-24 h-72 w-72 rounded-full bg-[#2E9BF0]/25 blur-3xl"/>
        <div aria-hidden="true" className="absolute -bottom-24 -left-16 h-72 w-72 rounded-full bg-[#0B63CE]/30 blur-3xl"/>
        <div data-reveal-stagger className="relative flex flex-col items-center justify-between gap-6 sm:flex-row sm:text-left">
          <div className="max-w-xl">
            <p className="mb-2 inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.18em] text-[#CFE6FB]">For local vehicle owners</p>
            <h2 data-reveal-item className="text-2xl font-bold md:text-3xl">Own a car or motorcycle in Bohol? List it on Kuyog Bohol.</h2>
            <p data-reveal-item className="mt-3 text-sm leading-6 text-white/75">Reach travelers across the island and turn your vehicle into extra income.</p>
          </div>
          <Link data-reveal-item href="/apply" className="motion-arrow inline-flex min-h-12 shrink-0 items-center justify-center gap-2 rounded-full bg-white px-7 text-sm font-semibold text-[#0A3D91]">Apply to list your vehicle<ArrowRight size={15}/></Link>
        </div>
      </div>
    </Reveal>

    {/* FAQ */}
    <section className="bg-[#F5FAFF] px-5 py-16 sm:px-8 md:py-24">
      <div className="mx-auto max-w-3xl">
        <p className="mb-3 text-center text-xs font-semibold uppercase tracking-[0.18em] text-[#0B63CE]">FAQ</p>
        <h2 className="text-center text-3xl font-bold tracking-tight text-[#0F2342] md:text-4xl">Questions, answered</h2>
        <div className="mx-auto mt-10 max-w-[880px] overflow-hidden rounded-2xl border border-[#D6E6F7] bg-white">
          {faq.map(([q,a],i)=><details name="home-faq" open={i===0 ? true : undefined} key={q} className="group border-b border-[#D6E6F7] px-6 py-5 last:border-0"><summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-4 font-semibold text-[#0F2342] marker:hidden">{q}<span aria-hidden="true" className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#EAF4FF] text-[#0B63CE] transition-transform duration-200 group-open:rotate-45"><span className="text-lg leading-none">+</span></span></summary><p className="pb-2 pt-1 text-sm leading-6 text-[#51657F]">{a}</p></details>)}
        </div>
      </div>
    </section>

    {/* Footer */}
    <footer id="footer" className="public-footer relative overflow-hidden bg-[#0F2342] px-5 pb-10 pt-14 text-white sm:px-8">
      <div className="relative mx-auto max-w-6xl">
        <div className="flex flex-wrap items-start justify-between gap-8">
          <div>
            <Link href="/" className="flex items-center gap-2 font-semibold"><Logo size={96}/>Kuyog Bohol</Link>
            <p className="mt-4 max-w-xs text-sm leading-6 text-white/70">Car rental in Bohol — self-drive or with a local driver. Booked online, driven by locals.</p>
          </div>
          <div className="flex flex-wrap gap-x-10 gap-y-6 text-sm">
            <div className="flex flex-col gap-2.5"><span className="text-xs font-semibold uppercase tracking-[0.14em] text-white/50">Explore</span><Link href="/#cars">Vehicles</Link><Link href="/#trips">With a driver</Link><Link href="/#how">How it works</Link></div>
            <div className="flex flex-col gap-2.5"><span className="text-xs font-semibold uppercase tracking-[0.14em] text-white/50">Company</span><Link href="/apply">Apply to list your vehicle</Link><Link href="/contact">Contact</Link></div>
            <div className="flex flex-col gap-2.5"><span className="text-xs font-semibold uppercase tracking-[0.14em] text-white/50">Legal</span><Link href="/terms">Terms</Link><Link href="/privacy">Privacy</Link></div>
          </div>
        </div>
        <p className="mt-10 border-t border-white/15 pt-6 text-xs text-white/60">© <Suspense fallback="2026"><CurrentYear/></Suspense> Kuyog Bohol. All rights reserved.</p>
      </div>
    </footer>
  </main>;
}

async function FeaturedCarsForQuery({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const query = await searchParams;
  const rawMode = Array.isArray(query.mode) ? query.mode[0] : query.mode;
  const mode = rawMode === "driver" || rawMode === "with_driver" ? "driver" : rawMode === "self" || rawMode === "self_drive" ? "self" : "all";
  return <FeaturedCars mode={mode}/>;
}

async function FeaturedCars({ mode }: { mode: "all" | "self" | "driver" }) {
  let cars: Parameters<typeof CarTile>[0]["car"][] = [];
  if (isSupabaseConfigured()) {
    await io();
    const db = await createClient();
    const { data } = await db.from("cars").select("id,brand,model,year,seats,transmission,car_type,vehicle_type,engine_cc,helmets_included,allows_self_drive,allows_with_driver,car_photos(path,thumb_path,sort_order),car_rates(mode,daily_rate)").eq("is_active", true).order("created_at", { ascending: false }).limit(6);
    cars = data ?? [];
  }

  return <section id="cars" className="scroll-mt-24 bg-white px-5 py-16 sm:px-8 md:py-24"><div className="mx-auto max-w-6xl"><div className="flex items-end justify-between gap-4"><div><p className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-[#0B63CE]">Ready when you are</p><h2 className="text-3xl font-bold tracking-tight text-[#0F2342] md:text-4xl">Featured vehicles</h2></div><Link href="/cars" className="group inline-flex shrink-0 items-center gap-1.5 text-sm font-semibold text-[#0B63CE] hover:text-[#0A3D91]">View all vehicles<ArrowRight size={15} className="transition-transform group-hover:translate-x-0.5"/></Link></div>{cars.length ? <FeaturedCarsGrid cars={cars} mode={mode}/> : <div className="mt-10 rounded-2xl border border-dashed border-[#B7D6F4] bg-[#F5FAFF] p-10 text-center"><div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-[#EAF4FF] text-[#0B63CE]"><CarFront/></div><h3 className="mt-4 font-semibold text-[#0F2342]">Vehicles are being added. Check back soon.</h3><Link href="/apply" className="mt-3 inline-block text-sm font-semibold text-[#0B63CE]">Apply to list your vehicle</Link></div>}</div></section>;
}

async function RideWithDriverData() {
  let lowestDriverPrice: number | null = null;
  if (isSupabaseConfigured()) {
    try {
      await io();
      const db = await createClient();
      const { data } = await db.from("cars").select("car_rates(mode,daily_rate)").eq("is_active", true).eq("allows_with_driver", true);
      const prices = (data ?? []).flatMap((car) => (car.car_rates ?? []).filter((rate) => rate.mode === "with_driver").map((rate) => Number(rate.daily_rate))).filter((price) => Number.isFinite(price) && price > 0);
      lowestDriverPrice = prices.length ? Math.min(...prices) : null;
    } catch {
      lowestDriverPrice = null;
    }
  }
  return <RideWithDriver lowestDriverPrice={lowestDriverPrice} />;
}

function FeaturedCarsFallback({ mode }: { mode: "all" | "self" | "driver" }) {
  return <section id="cars" className="bg-white px-5 py-16 sm:px-8 md:py-24"><div className="mx-auto max-w-6xl"><div><p className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-[#0B63CE]">Ready when you are</p><h2 className="text-3xl font-bold tracking-tight text-[#0F2342] md:text-4xl">Featured vehicles</h2></div><div role="status" className="mt-10 rounded-2xl border border-dashed border-[#B7D6F4] bg-[#F5FAFF] p-10 text-center text-sm text-[#51657F]">Loading {mode === "driver" ? "cars with a driver" : mode === "self" ? "self-drive vehicles" : "vehicles"}…</div></div></section>;
}
