"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowRight, CarFront } from "lucide-react";

export function Header() {
  const pathname = usePathname();
  if (pathname.startsWith("/owner") || pathname.startsWith("/admin")) return null;

  return (
    <header className="sticky top-0 z-50 w-full border-b border-[#e9ede9]/90 bg-[#fbfcfa]/90 backdrop-blur-xl">
      <div className="mx-auto flex h-[68px] max-w-6xl items-center justify-between px-5 sm:px-8">
        <Link href="/" className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#2457d6] text-white shadow-sm"><CarFront size={20} /></span>
          <span className="text-[15px] font-semibold tracking-tight text-[#23372a]">JC Rentals</span>
        </Link>
        <nav className="hidden items-center gap-8 text-[12px] font-medium text-[#67766b] md:flex">
          <Link href="#features" className="transition-colors hover:text-[#2457d6]">Features</Link>
          <Link href="#how-it-works" className="transition-colors hover:text-[#2457d6]">How it works</Link>
          <Link href="/contact" className="transition-colors hover:text-[#2457d6]">Contact</Link>
        </nav>

        <div className="flex items-center gap-4">
          <Link
            href="/account/bookings"
            className="hidden text-[12px] font-medium text-[#536459] transition-colors hover:text-[#2457d6] lg:block"
          >
            My bookings
          </Link>
          <Link
            href="/login"
            className="text-[12px] font-medium text-[#536459] transition-colors hover:text-[#2457d6]"
          >
            Log in
          </Link>
          <Link
            href="/signup"
            className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg bg-[#2457d6] px-4 text-[12px] font-semibold text-white shadow-sm transition-colors hover:bg-[#1d4ed8]"
          >
            Get started <ArrowRight size={13} />
          </Link>
        </div>
      </div>
    </header>
  );
}
