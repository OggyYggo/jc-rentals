"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowRight, CarFront, Menu } from "lucide-react";

export function Header() {
  const pathname = usePathname();
  if (pathname.startsWith("/owner") || pathname.startsWith("/admin")) return null;
  const isPublic = !pathname.startsWith("/for-owners");

  return (
    <header className={`sticky top-0 z-50 w-full border-b backdrop-blur-xl ${isPublic ? "theme-public border-[#D6E6F7]/90 bg-white/90" : "border-[#e9ede9]/90 bg-[#fbfcfa]/90"}`}>
      <div className="mx-auto flex h-[68px] max-w-6xl items-center justify-between px-5 sm:px-8">
        <Link href="/" className="flex items-center gap-2.5">
          <span className={`flex h-9 w-9 items-center justify-center rounded-xl text-white shadow-sm ${isPublic ? "bg-[#0B63CE]" : "bg-[#2457d6]"}`}><CarFront size={20} /></span>
          <span className={`text-[15px] font-semibold tracking-tight ${isPublic ? "text-[#0F2342]" : "text-[#23372a]"}`}>Kuyog Bohol</span>
        </Link>
        <nav className={`hidden items-center gap-5 text-[12px] font-medium lg:flex ${isPublic ? "text-[#51657F]" : "text-[#67766b]"}`}>
          <Link href="/cars" className={`transition-colors ${isPublic ? "hover:text-[#0B63CE]" : "hover:text-[#2457d6]"}`}>Cars</Link>
          <Link href="/#popular-trips" className={`transition-colors ${isPublic ? "hover:text-[#0B63CE]" : "hover:text-[#2457d6]"}`}>Popular trips</Link>
          <Link href="/#how-it-works" className={`transition-colors ${isPublic ? "hover:text-[#0B63CE]" : "hover:text-[#2457d6]"}`}>How it works</Link>
          <Link href="/for-owners" className={`transition-colors ${isPublic ? "hover:text-[#0B63CE]" : "hover:text-[#2457d6]"}`}>List your car</Link>
          <Link href="/contact" className={`transition-colors ${isPublic ? "hover:text-[#0B63CE]" : "hover:text-[#2457d6]"}`}>Contact</Link>
        </nav>

        <div className="hidden items-center gap-4 md:flex">
          <Link
            href="/account/bookings"
            className="hidden text-[12px] font-medium text-[#51657F] transition-colors hover:text-[#0B63CE] lg:block"
          >
            My bookings
          </Link>
          <Link
            href="/login"
            className="text-[12px] font-medium text-[#51657F] transition-colors hover:text-[#0B63CE]"
          >
            Log in
          </Link>
          <Link
            href="/signup"
            className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg bg-[#0B63CE] px-4 text-[12px] font-semibold text-white shadow-sm transition-colors hover:bg-[#0A3D91]"
          >
            Sign up <ArrowRight size={13} />
          </Link>
        </div>
        <details className="group absolute right-5 top-4 z-50 md:hidden">
          <summary className="flex h-9 w-9 cursor-pointer list-none items-center justify-center rounded-lg border border-[#e4eae4] bg-white text-[#51657F]"><Menu size={18}/></summary>
          <nav className="grid gap-1 text-sm text-[#0F2342]"><Link className="rounded-lg px-3 py-2.5 hover:bg-[#EAF4FF]" href="/cars">Cars</Link><Link className="rounded-lg px-3 py-2.5 hover:bg-[#EAF4FF]" href="/#popular-trips">Popular trips</Link><Link className="rounded-lg px-3 py-2.5 hover:bg-[#EAF4FF]" href="/#how-it-works">How it works</Link><Link className="rounded-lg px-3 py-2.5 hover:bg-[#EAF4FF]" href="/for-owners">List your car</Link><Link className="rounded-lg px-3 py-2.5 hover:bg-[#EAF4FF]" href="/contact">Contact</Link><Link className="rounded-lg px-3 py-2.5 hover:bg-[#EAF4FF]" href="/account/bookings">My bookings</Link><Link className="rounded-lg px-3 py-2.5 hover:bg-[#EAF4FF]" href="/login">Log in</Link><Link className="mt-1 rounded-full bg-[#0B63CE] px-3 py-2.5 text-center font-semibold text-white" href="/signup">Sign up</Link></nav>
        </details>
      </div>
    </header>
  );
}
