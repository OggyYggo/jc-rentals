import Link from "next/link";
import { Suspense } from "react";
import { CarFront, ShieldCheck, Wallet, FileText, MapPin, Users, CircleDollarSign, Mountain, Waves, Sailboat, Plane, ArrowRight, Check } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/shared";
import { SearchForm } from "@/components/customer/search-form";
import { CarTile } from "@/components/customer/car-tile";
import { HillsDivider } from "@/components/brand/hills-divider";

export const metadata = { title: "Kuyog Bohol: Car Rental in Bohol, Self-Drive and With Driver", description: "Rent a car in Bohol from local owners. Drive yourself or hire a car with a driver. Book online in minutes." };
const trips = [
  { title: "Countryside day tour", desc: "Chocolate Hills, Loboc River, Bilar forest and tarsiers", Icon: Mountain, art: "trip-hills" },
  { title: "Panglao and Alona beach day", desc: "Spend the day between Panglao's beaches and resorts", Icon: Waves, art: "trip-sea" },
  { title: "Island hopping transfer", desc: "Plan a ride for an early boat or dolphin watching trip", Icon: Sailboat, art: "trip-island" },
  { title: "Airport or hotel transfer", desc: "Arrange a convenient pickup to start your Bohol stay", Icon: Plane, art: "trip-sky" },
];
const faq = [
  ["What do I need to rent self-drive?", "A valid driver's license, a valid ID, and a deposit are required. TODO: confirm final document and deposit policy."],
  ["Can I book with a driver instead?", "Yes. You do not need a driver's license for a booking with a driver."],
  ["How do I pay?", "Pay a small deposit by QR and the balance to the owner at pickup. TODO: confirm payment policy."],
  ["What if I need to cancel?", "Please review the cancellation policy before booking. TODO: confirm cancellation terms and add the policy link."],
  ["Is fuel included?", "Fuel arrangements depend on the listing and are shown on each car. TODO: confirm standard policy."],
  ["Where do I pick up?", "Pickup details are shown on the car page and confirmed after booking."],
];

export default function Home() {
  return <main className="theme-public overflow-hidden bg-white text-[#0F2342]">
    <section className="public-hero relative flex min-h-[60vh] flex-col justify-center px-5 pb-24 pt-16 sm:px-8 md:min-h-[70vh] md:pb-32">
      <div aria-hidden="true" className="public-hero-art absolute inset-0"><div className="hero-sun"/><div className="hero-island hero-island-back"/><div className="hero-island hero-island-front"/><div className="hero-water"/></div>
      <div className="relative z-10 mx-auto w-full max-w-6xl text-center text-white"><span className="inline-flex items-center gap-2 rounded-full border border-white/30 bg-[#0F2342]/25 px-4 py-2 text-xs font-semibold backdrop-blur-sm"><MapPin size={14}/> Car rental in Bohol</span><h1 className="mx-auto mt-6 max-w-4xl text-4xl font-semibold leading-[1.08] tracking-tight md:text-6xl">Explore Bohol your way.</h1><p className="mx-auto mt-5 max-w-xl text-base leading-7 text-white/90 md:text-lg">Drive yourself or ride with a local driver. Book in minutes.</p><div className="mt-7 flex flex-wrap justify-center gap-x-6 gap-y-2 text-xs font-medium text-white/90"><span className="flex items-center gap-2"><Check size={15}/> Local owners</span><span className="flex items-center gap-2"><Check size={15}/> Clear prices</span><span className="flex items-center gap-2"><Check size={15}/> Easy online booking</span></div></div>
      <SearchForm />
      <HillsDivider className="pointer-events-none absolute inset-x-0 -bottom-px z-10 h-16 w-full md:h-28" back="#CFE6FB" front="#FFFFFF" />
    </section>

    <section className="relative z-10 border-b border-[#D6E6F7] bg-white px-5 py-5 pt-20 sm:px-8 sm:pt-24"><div className="mx-auto flex max-w-6xl flex-wrap justify-center gap-x-9 gap-y-3 text-xs font-medium text-[#0F2342]">{[[ShieldCheck,"Verified local owners"],[Wallet,"Clear prices, no hidden fees"],[CarFront,"Small deposit to book"],[FileText,"Documents kept private"]].map(([Icon,label]:any)=><span className="flex items-center gap-2" key={label}><Icon size={16} className="text-[#0B63CE]"/>{label}</span>)}</div></section>

    <section id="popular-trips" className="bg-[#EAF4FF] px-5 py-16 sm:px-8 md:py-20"><div className="mx-auto max-w-6xl"><p className="mb-2 text-xs font-semibold uppercase tracking-[.16em] text-[#0B63CE]">Get around Bohol</p><div className="flex flex-wrap items-end justify-between gap-4"><h2 className="text-3xl font-semibold tracking-tight text-[#0F2342] md:text-4xl">Popular trips with a driver</h2><Link href="/cars?mode=with_driver" className="text-sm font-semibold text-[#0B63CE]">Browse cars <ArrowRight size={15} className="ml-1 inline"/></Link></div><div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{trips.map(({title,desc,Icon,art})=><Link key={title} href="/cars?mode=with_driver" className={`trip-tile ${art} group relative flex min-h-[260px] flex-col justify-end overflow-hidden rounded-2xl p-5 text-white`}><div className="trip-tile-art absolute inset-0"/><div className="trip-tile-shape absolute inset-0"/><Icon className="relative mb-auto mt-2 h-9 w-9 text-white/90" strokeWidth={1.5}/><h3 className="relative text-lg font-semibold">{title}</h3><p className="relative mt-1 text-sm leading-5 text-white/85">{desc}</p><span className="relative mt-4 inline-flex items-center gap-1 text-xs font-semibold">Find a car with driver <ArrowRight size={14}/></span></Link>)}</div></div></section>

    <Suspense fallback={<FeaturedCarsFallback/>}><FeaturedCars/></Suspense>

    <section id="how-it-works" className="bg-[#EAF4FF] px-5 py-16 sm:px-8 md:py-20"><div className="mx-auto max-w-6xl"><p className="mb-2 text-center text-xs font-semibold uppercase tracking-[.16em] text-[#0B63CE]">A few simple steps</p><h2 className="text-center text-3xl font-semibold text-[#0F2342] md:text-4xl">How it works</h2><div className="mt-10 grid gap-7 sm:grid-cols-3">{[["01","Choose your car","Pick dates, Self-drive or With driver, and a car."],["02","Pay a small deposit","Scan the QR and upload your proof of payment."],["03","Pick up and go","Meet the owner or driver, pay the balance, and enjoy Bohol."]].map(([n,title,desc])=><div className="rounded-2xl border border-[#D6E6F7] bg-white p-6" key={n}><span className="flex h-10 w-10 items-center justify-center rounded-full bg-[#0B63CE] text-xs font-semibold text-white">{n}</span><h3 className="mt-5 font-semibold text-[#0F2342]">{title}</h3><p className="mt-2 text-sm leading-6 text-[#51657F]">{desc}</p></div>)}</div></div></section>

    <section className="bg-white px-5 py-16 sm:px-8 md:py-20"><div className="mx-auto max-w-6xl"><p className="mb-2 text-center text-xs font-semibold uppercase tracking-[.16em] text-[#0B63CE]">Made for your Bohol trip</p><h2 className="text-center text-3xl font-semibold text-[#0F2342] md:text-4xl">Why book with Kuyog Bohol</h2><div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{[[Users,"Local owners","Cars come from owners based in Bohol."],[CarFront,"Two ways to travel","Drive yourself or ride with a driver."],[CircleDollarSign,"Clear pricing","See what is included before you book."],[ShieldCheck,"Private documents","Your license and ID are stored securely."]].map(([Icon,title,desc]:any)=><article key={title} className="public-card rounded-2xl border border-[#D6E6F7] bg-white p-6"><div className="mb-5 flex h-11 w-11 items-center justify-center rounded-full bg-[#EAF4FF] text-[#0B63CE]"><Icon size={20}/></div><h3 className="font-semibold text-[#0F2342]">{title}</h3><p className="mt-2 text-sm leading-6 text-[#51657F]">{desc}</p></article>)}</div></div></section>

    <section className="bg-white px-5 py-8 sm:px-8 md:py-12"><div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-5 rounded-3xl bg-[#0A3D91] px-7 py-10 text-center text-white sm:flex-row sm:px-12 sm:text-left"><div><p className="mb-2 text-xs font-semibold uppercase tracking-[.16em] text-[#CFE6FB]">For local car owners</p><h2 className="text-2xl font-semibold md:text-3xl">Own a car in Bohol? List it on Kuyog Bohol.</h2></div><Link href="/for-owners" className="inline-flex min-h-12 shrink-0 items-center justify-center rounded-full bg-white px-6 text-sm font-semibold text-[#0A3D91]">List your car</Link></div></section>

    <section className="bg-[#EAF4FF] px-5 py-16 sm:px-8 md:py-20"><div className="mx-auto max-w-3xl"><p className="mb-2 text-center text-xs font-semibold uppercase tracking-[.16em] text-[#0B63CE]">Good to know</p><h2 className="mb-7 text-center text-3xl font-semibold text-[#0F2342] md:text-4xl">Frequently asked questions</h2><div className="overflow-hidden rounded-2xl border border-[#D6E6F7] bg-white">{faq.map(([q,a])=><details key={q} className="group border-b border-[#D6E6F7] px-5 py-4 last:border-0"><summary className="min-h-11 cursor-pointer list-none py-2 font-semibold text-[#0F2342] marker:hidden">{q}<span aria-hidden="true" className="float-right ml-3 text-[#0B63CE] group-open:rotate-45">+</span></summary><p className="pb-2 text-sm leading-6 text-[#51657F]">{a}</p></details>)}</div></div></section>

    <footer className="public-footer relative overflow-hidden bg-[#0A3D91] px-5 pb-9 pt-20 text-white sm:px-8"><HillsDivider className="absolute inset-x-0 top-0 h-12 w-full -rotate-180 md:h-16" back="#2E9BF0" front="#0A3D91"/><div className="relative mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-5"><Link href="/" className="flex items-center gap-2 font-semibold"><span className="flex h-9 w-9 items-center justify-center rounded-full bg-white text-[#0A3D91]"><CarFront size={19}/></span>Kuyog Bohol</Link><div className="flex flex-wrap gap-x-5 gap-y-3 text-xs text-white/85"><Link href="/cars">Cars</Link><Link href="/#how-it-works">How it works</Link><Link href="/for-owners">List your car</Link><Link href="/contact">Contact</Link><Link href="/terms">Terms</Link><Link href="/privacy">Privacy</Link></div><p className="w-full border-t border-white/20 pt-5 text-xs text-white/80">Car rental in Bohol. Self-drive or with a local driver.</p></div></footer>
  </main>;
}

async function FeaturedCars() {
  let cars: any[] = [];
  if (isSupabaseConfigured()) {
    const db = await createClient();
    const { data } = await db.from("cars").select("id,brand,model,year,seats,transmission,car_type,allows_self_drive,allows_with_driver,car_photos(path,sort_order),car_rates(mode,daily_rate)").eq("is_active", true).order("created_at", { ascending: false }).limit(6);
    cars = data ?? [];
  }

  return <section id="cars" className="bg-white px-5 py-16 sm:px-8 md:py-20"><div className="mx-auto max-w-6xl"><div className="flex items-end justify-between gap-4"><div><p className="mb-2 text-xs font-semibold uppercase tracking-[.16em] text-[#0B63CE]">Ready when you are</p><h2 className="text-3xl font-semibold tracking-tight text-[#0F2342] md:text-4xl">Featured cars</h2></div><Link href="/cars" className="shrink-0 text-sm font-semibold text-[#0B63CE]">View all cars <ArrowRight size={15} className="ml-1 inline"/></Link></div>{cars.length ? <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">{cars.map(car=><CarTile key={car.id} car={car}/>)}</div> : <div className="mt-8 rounded-2xl border border-dashed border-[#B7D6F4] bg-[#F5FAFF] p-10 text-center"><div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-[#EAF4FF] text-[#0B63CE]"><CarFront/></div><h3 className="mt-4 font-semibold text-[#0F2342]">Cars are being added. Check back soon.</h3><Link href="/for-owners" className="mt-3 inline-block text-sm font-semibold text-[#0B63CE]">List your car</Link></div>}</div></section>;
}

function FeaturedCarsFallback() {
  return <section id="cars" className="bg-white px-5 py-16 sm:px-8 md:py-20"><div className="mx-auto max-w-6xl"><div><p className="mb-2 text-xs font-semibold uppercase tracking-[.16em] text-[#0B63CE]">Ready when you are</p><h2 className="text-3xl font-semibold tracking-tight text-[#0F2342] md:text-4xl">Featured cars</h2></div><div className="mt-8 rounded-2xl border border-dashed border-[#B7D6F4] bg-[#F5FAFF] p-10 text-center text-sm text-[#51657F]">Loading cars…</div></div></section>;
}
