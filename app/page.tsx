import Link from "next/link";
import Image from "next/image";
import heroBackground from "@/img/bg.jpg";
import { Suspense } from "react";
import { io } from "next/cache";
import { CarFront, ShieldCheck, Wallet, FileText, MapPin, Users, CircleDollarSign, Mountain, Waves, Sailboat, Plane, ArrowRight, Check, CalendarCheck, MessageSquare, BadgeCheck, Sparkles, type LucideIcon } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/shared";
import { SearchForm } from "@/components/customer/search-form";
import { CarTile } from "@/components/customer/car-tile";
import { Logo } from "@/components/logo";
import { CurrentYear } from "@/components/current-year";

export const metadata = { title: "Kuyog Bohol: Car Rental in Bohol, Self-Drive and With Driver", description: "Rent a car in Bohol from local owners. Drive yourself or hire a car with a driver. Book online in minutes." };
const trips = [
  { title: "Countryside day tour", desc: "Chocolate Hills, Loboc River, Bilar forest and tarsiers", Icon: Mountain, art: "trip-hills" },
  { title: "Panglao and Alona beach day", desc: "Spend the day between Panglao's beaches and resorts", Icon: Waves, art: "trip-sea" },
  { title: "Island hopping transfer", desc: "Plan a ride for an early boat or dolphin watching trip", Icon: Sailboat, art: "trip-island" },
  { title: "Airport or hotel transfer", desc: "Arrange a convenient pickup to start your Bohol stay", Icon: Plane, art: "trip-sky" },
];
const steps = [
  { Icon: CalendarCheck, title: "Choose your car", desc: "Pick your dates, choose Self-drive or With driver, and select the car that fits your trip." },
  { Icon: BadgeCheck, title: "Book with a small deposit", desc: "Scan the QR code, upload your proof of payment, and your booking is confirmed." },
  { Icon: MessageSquare, title: "Pick up and go", desc: "Meet the owner or your driver, settle the balance, and start exploring Bohol." },
];
const faq = [
  ["What do I need to rent self-drive?", "A valid driver's license, a valid ID, and a deposit are required. TODO: confirm final document and deposit policy."],
  ["Can I book with a driver instead?", "Yes. You do not need a driver's license for a booking with a driver."],
  ["How do I pay?", "Pay a small deposit by QR and the balance to the owner at pickup. TODO: confirm payment policy."],
  ["What if I need to cancel?", "Please review the cancellation policy before booking. TODO: confirm cancellation terms and add the policy link."],
  ["Is fuel included?", "Fuel arrangements depend on the listing and are shown on each car. TODO: confirm standard policy."],
  ["Where do I pick up?", "Pickup details are shown on the car page and confirmed after booking."],
];
const trustItems: [LucideIcon, string][] = [
  [ShieldCheck, "Verified local owners"],
  [Wallet, "Transparent pricing, no hidden fees"],
  [CarFront, "Small deposit to book"],
  [FileText, "Your documents stay private"],
];
const perks: [LucideIcon, string, string][] = [
  [Users, "Local owners", "Cars come from owners based right here in Bohol."],
  [CarFront, "Two ways to travel", "Drive yourself or ride with a professional local driver."],
  [CircleDollarSign, "Clear pricing", "See exactly what is included before you book — no surprises."],
  [ShieldCheck, "Private documents", "Your license and ID are stored securely and only shared when needed."],
];

export default function Home() {
  return <main className="theme-public overflow-hidden bg-white text-[#0F2342]">
    {/* Hero */}
    <section className="public-hero relative flex min-h-[72vh] flex-col justify-center px-5 pb-28 pt-20 sm:px-8 md:min-h-[82vh] md:pb-32 md:pt-24">
      <Image src={heroBackground} alt="The Chocolate Hills in Bohol" fill priority sizes="100vw" className="object-cover object-center"/>
      <div aria-hidden="true" className="absolute inset-0 bg-gradient-to-b from-[#0A3D91]/80 via-[#0A3D91]/45 to-[#0F2342]/75"/>
      <div className="relative z-10 mx-auto w-full max-w-6xl text-center text-white">
        <span className="inline-flex items-center gap-2 rounded-full border border-white/30 bg-white/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.14em] backdrop-blur-md"><MapPin size={14}/> Bohol, Philippines</span>
        <h1 className="mx-auto mt-6 max-w-9xl text-4xl font-bold leading-[1.08] tracking-tight md:text-6xl lg:text-7xl">Find your ride across Bohol.</h1>
        <p className="mx-auto mt-5 max-w-2xl text-base leading-7 text-white/85 md:text-lg">Self-drive or with a local driver, real cars from real owners, booked online in minutes.</p>
        <div className="mt-8 flex flex-wrap justify-center gap-x-8 gap-y-3 text-sm font-medium text-white/90">
          <span className="flex items-center gap-2"><Check size={16} className="text-[#7FD1FF]"/> Local owners</span>
          <span className="flex items-center gap-2"><Check size={16} className="text-[#7FD1FF]"/> Clear pricing</span>
          <span className="flex items-center gap-2"><Check size={16} className="text-[#7FD1FF]"/> Secure booking</span>
          <span className="flex items-center gap-2"><Check size={16} className="text-[#7FD1FF]"/> 24/7 support</span>
        </div>
      </div>
      <SearchForm />
    </section>

    {/* Trust strip */}
    <section className="border-b border-[#D6E6F7] bg-white px-5 py-10 sm:px-8">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-center gap-x-14 gap-y-6 text-sm font-medium text-[#0F2342] md:text-base">
        {trustItems.map(([Icon,label])=><span className="flex items-center gap-3" key={label}><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#EAF4FF] text-[#0B63CE]"><Icon size={20} strokeWidth={1.8}/></span>{label}</span>)}
      </div>
    </section>

    {/* Popular trips */}
    <section id="popular-trips" className="bg-[#F5FAFF] px-5 py-16 sm:px-8 md:py-24">
      <div className="mx-auto max-w-6xl">
        <p className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-[#0B63CE]">Get around Bohol</p>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <h2 className="text-3xl font-bold tracking-tight text-[#0F2342] md:text-4xl">Popular trips with a driver</h2>
          <Link href="/cars?mode=with_driver" className="group inline-flex items-center gap-1.5 text-sm font-semibold text-[#0B63CE] hover:text-[#0A3D91]">Browse cars with driver<ArrowRight size={15} className="transition-transform group-hover:translate-x-0.5"/></Link>
        </div>
        <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {trips.map(({title,desc,Icon,art})=><Link key={title} href="/cars?mode=with_driver" className={`trip-tile ${art} group relative flex min-h-[280px] flex-col justify-end overflow-hidden rounded-2xl p-6 text-white`}><div className="trip-tile-art absolute inset-0"/><div className="trip-tile-shade absolute inset-0"/><Icon className="relative mb-auto mt-1 h-9 w-9 text-white/90" strokeWidth={1.5}/><h3 className="relative text-lg font-semibold">{title}</h3><p className="relative mt-1.5 text-sm leading-6 text-white/85">{desc}</p><span className="relative mt-4 inline-flex items-center gap-1.5 text-xs font-semibold">Find a car<ArrowRight size={14} className="transition-transform group-hover:translate-x-1"/></span></Link>)}
        </div>
      </div>
    </section>

    <Suspense fallback={<FeaturedCarsFallback/>}><FeaturedCars/></Suspense>

    {/* How it works */}
    <section id="how-it-works" className="relative overflow-hidden bg-[#0A3D91] px-5 py-16 sm:px-8 md:py-24">
      <div aria-hidden="true" className="absolute -left-32 top-0 h-96 w-96 rounded-full bg-[#2E9BF0]/20 blur-3xl"/>
      <div aria-hidden="true" className="absolute -bottom-32 right-0 h-96 w-96 rounded-full bg-[#0B63CE]/25 blur-3xl"/>
      <div className="relative mx-auto max-w-6xl">
        <p className="mb-3 text-center text-xs font-semibold uppercase tracking-[0.18em] text-[#7FD1FF]">A few simple steps</p>
        <h2 className="text-center text-3xl font-bold tracking-tight text-white md:text-4xl">How it works</h2>
        <p className="mx-auto mt-4 max-w-xl text-center text-sm leading-6 text-white/70">From search to pickup in three easy steps — no paperwork headaches.</p>
        <div className="relative mt-14 grid gap-8 sm:grid-cols-3 sm:gap-6">
          <div aria-hidden="true" className="absolute left-[16%] right-[16%] top-7 hidden h-px bg-gradient-to-r from-transparent via-white/25 to-transparent sm:block"/>
          {steps.map(({Icon,title,desc},i)=><div className="relative text-center" key={title}>
            <div className="relative mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-white text-[#0A3D91] shadow-[0_12px_28px_-10px_rgba(0,0,0,.4)]"><Icon size={24} strokeWidth={1.8}/><span className="absolute -right-2 -top-2 flex h-6 w-6 items-center justify-center rounded-full border-2 border-[#0A3D91] bg-[#2E9BF0] text-[10px] font-bold text-white">{i+1}</span></div>
            <h3 className="mt-5 font-semibold text-white">{title}</h3>
            <p className="mt-2 text-sm leading-6 text-white/70">{desc}</p>
          </div>)}
        </div>
      </div>
    </section>

    {/* Why book */}
    <section className="bg-[#F5FAFF] px-5 py-16 sm:px-8 md:py-24">
      <div className="mx-auto max-w-6xl">
        <p className="mb-3 text-center text-xs font-semibold uppercase tracking-[0.18em] text-[#0B63CE]">Made for your Bohol trip</p>
        <h2 className="text-center text-3xl font-bold tracking-tight text-[#0F2342] md:text-4xl">Why book with Kuyog Bohol</h2>
        <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {perks.map(([Icon,title,desc])=><article key={title} className="public-card rounded-2xl border border-[#D6E6F7] bg-white p-6"><div className="mb-5 flex h-11 w-11 items-center justify-center rounded-xl bg-[#EAF4FF] text-[#0B63CE]"><Icon size={22} strokeWidth={1.8}/></div><h3 className="font-semibold text-[#0F2342]">{title}</h3><p className="mt-2 text-sm leading-6 text-[#51657F]">{desc}</p></article>)}
        </div>
      </div>
    </section>

    {/* Owner CTA */}
    <section className="bg-white px-5 py-16 sm:px-8 md:py-20">
      <div className="relative mx-auto max-w-6xl overflow-hidden rounded-3xl bg-[#0A3D91] px-7 py-12 text-center text-white sm:px-12 md:py-16">
        <div aria-hidden="true" className="absolute -right-20 -top-24 h-72 w-72 rounded-full bg-[#2E9BF0]/25 blur-3xl"/>
        <div aria-hidden="true" className="absolute -bottom-24 -left-16 h-72 w-72 rounded-full bg-[#0B63CE]/30 blur-3xl"/>
        <div className="relative flex flex-col items-center justify-between gap-6 sm:flex-row sm:text-left">
          <div className="max-w-xl">
            <p className="mb-2 inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.18em] text-[#CFE6FB]"><Sparkles size={14}/> For local car owners</p>
            <h2 className="text-2xl font-bold md:text-3xl">Own a car in Bohol? List it on Kuyog Bohol.</h2>
            <p className="mt-3 text-sm leading-6 text-white/75">Reach travelers across the island and turn your car into extra income.</p>
          </div>
          <Link href="/for-owners" className="inline-flex min-h-12 shrink-0 items-center justify-center gap-2 rounded-full bg-white px-7 text-sm font-semibold text-[#0A3D91] transition-transform hover:scale-[1.03]">List your car<ArrowRight size={15}/></Link>
        </div>
      </div>
    </section>

    {/* FAQ */}
    <section className="bg-[#F5FAFF] px-5 py-16 sm:px-8 md:py-24">
      <div className="mx-auto max-w-3xl">
        <p className="mb-3 text-center text-xs font-semibold uppercase tracking-[0.18em] text-[#0B63CE]">Good to know</p>
        <h2 className="text-center text-3xl font-bold tracking-tight text-[#0F2342] md:text-4xl">Frequently asked questions</h2>
        <div className="mt-10 overflow-hidden rounded-2xl border border-[#D6E6F7] bg-white">
          {faq.map(([q,a])=><details key={q} className="group border-b border-[#D6E6F7] px-6 py-5 last:border-0"><summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-4 font-semibold text-[#0F2342] marker:hidden">{q}<span aria-hidden="true" className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#EAF4FF] text-[#0B63CE] transition-transform duration-200 group-open:rotate-45"><span className="text-lg leading-none">+</span></span></summary><p className="pb-2 pt-1 text-sm leading-6 text-[#51657F]">{a}</p></details>)}
        </div>
      </div>
    </section>

    {/* Footer */}
    <footer className="public-footer relative overflow-hidden bg-[#0A3D91] px-5 pb-10 pt-14 text-white sm:px-8">
      <div className="relative mx-auto max-w-6xl">
        <div className="flex flex-wrap items-start justify-between gap-8">
          <div>
            <Link href="/" className="flex items-center gap-2 font-semibold"><Logo size={96}/>Kuyog Bohol</Link>
            <p className="mt-4 max-w-xs text-sm leading-6 text-white/70">Car rental in Bohol — self-drive or with a local driver. Booked online, driven by locals.</p>
          </div>
          <div className="flex flex-wrap gap-x-10 gap-y-6 text-sm">
            <div className="flex flex-col gap-2.5"><span className="text-xs font-semibold uppercase tracking-[0.14em] text-white/50">Explore</span><Link href="/cars">Cars</Link><Link href="/#popular-trips">Popular trips</Link><Link href="/#how-it-works">How it works</Link></div>
            <div className="flex flex-col gap-2.5"><span className="text-xs font-semibold uppercase tracking-[0.14em] text-white/50">Company</span><Link href="/for-owners">List your car</Link><Link href="/contact">Contact</Link></div>
            <div className="flex flex-col gap-2.5"><span className="text-xs font-semibold uppercase tracking-[0.14em] text-white/50">Legal</span><Link href="/terms">Terms</Link><Link href="/privacy">Privacy</Link></div>
          </div>
        </div>
        <p className="mt-10 border-t border-white/15 pt-6 text-xs text-white/60">© <Suspense fallback="2026"><CurrentYear/></Suspense> Kuyog Bohol. All rights reserved.</p>
      </div>
    </footer>
  </main>;
}

async function FeaturedCars() {
  let cars: Parameters<typeof CarTile>[0]["car"][] = [];
  if (isSupabaseConfigured()) {
    await io();
    const db = await createClient();
    const { data } = await db.from("cars").select("id,brand,model,year,seats,transmission,car_type,allows_self_drive,allows_with_driver,car_photos(path,thumb_path,sort_order),car_rates(mode,daily_rate)").eq("is_active", true).order("created_at", { ascending: false }).limit(6);
    cars = data ?? [];
  }

  return <section id="cars" className="bg-white px-5 py-16 sm:px-8 md:py-24"><div className="mx-auto max-w-6xl"><div className="flex items-end justify-between gap-4"><div><p className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-[#0B63CE]">Ready when you are</p><h2 className="text-3xl font-bold tracking-tight text-[#0F2342] md:text-4xl">Featured cars</h2></div><Link href="/cars" className="group inline-flex shrink-0 items-center gap-1.5 text-sm font-semibold text-[#0B63CE] hover:text-[#0A3D91]">View all cars<ArrowRight size={15} className="transition-transform group-hover:translate-x-0.5"/></Link></div>{cars.length ? <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">{cars.map(car=><CarTile key={car.id} car={car}/>)}</div> : <div className="mt-10 rounded-2xl border border-dashed border-[#B7D6F4] bg-[#F5FAFF] p-10 text-center"><div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-[#EAF4FF] text-[#0B63CE]"><CarFront/></div><h3 className="mt-4 font-semibold text-[#0F2342]">Cars are being added. Check back soon.</h3><Link href="/for-owners" className="mt-3 inline-block text-sm font-semibold text-[#0B63CE]">List your car</Link></div>}</div></section>;
}

function FeaturedCarsFallback() {
  return <section id="cars" className="bg-white px-5 py-16 sm:px-8 md:py-24"><div className="mx-auto max-w-6xl"><div><p className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-[#0B63CE]">Ready when you are</p><h2 className="text-3xl font-bold tracking-tight text-[#0F2342] md:text-4xl">Featured cars</h2></div><div className="mt-10 rounded-2xl border border-dashed border-[#B7D6F4] bg-[#F5FAFF] p-10 text-center text-sm text-[#51657F]">Loading cars…</div></div></section>;
}
