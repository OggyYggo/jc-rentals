"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, type MouseEvent } from "react";
import { ArrowRight, CarFront, CircleUserRound, Menu, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/shared";

export function Header() {
  const pathname = usePathname();
  const [userName, setUserName] = useState<string | null>(null);
  const activeUserId = useRef<string | null>(null);
  const userInitial = userName?.trim().charAt(0).toUpperCase() || "U";

  useEffect(() => {
    if (!isSupabaseConfigured()) return;
    const supabase = createClient();
    const updateIdentity = (user: { id: string; email?: string; user_metadata?: Record<string, unknown> } | null) => {
      activeUserId.current = user?.id ?? null;
      const metadataName = typeof user?.user_metadata?.full_name === "string"
        ? user.user_metadata.full_name
        : typeof user?.user_metadata?.name === "string" ? user.user_metadata.name : "";
      const fallbackName = metadataName.trim() || user?.email?.split("@")[0] || null;
      setUserName(fallbackName);
      if (!user) return;
      void supabase.from("profiles").select("full_name").eq("id", user.id).maybeSingle().then(({ data }) => {
        if (activeUserId.current === user.id && data?.full_name?.trim()) setUserName(data.full_name.trim());
      });
    };
    supabase.auth.getSession().then(({ data }) => updateIdentity(data.session?.user ?? null));
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      updateIdentity(session?.user ?? null);
    });
    return () => subscription.unsubscribe();
  }, []);

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
          {userName ? <>
            <span title={`Signed in as ${userName}`} className="hidden max-w-44 items-center gap-2 rounded-full border border-[#CFE0FA] bg-[#F2F7FF] py-1 pl-1 pr-3 lg:inline-flex">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#0B63CE] text-[11px] font-semibold text-white">{userInitial}</span>
              <span className="min-w-0"><span className="block text-[9px] font-medium uppercase tracking-wide text-[#6D82A3]">Signed in</span><span className="block truncate text-[11px] font-semibold text-[#183B70]">{userName}</span></span>
            </span>
            <Link href="/account/bookings" className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-[#0B63CE] px-3.5 text-[12px] font-semibold text-white shadow-sm transition-colors hover:bg-[#0A3D91]"><CircleUserRound size={15} /> My account</Link>
          </> : <>
            <Link href="/account/bookings" className="hidden text-[12px] font-medium text-[#51657F] transition-colors hover:text-[#0B63CE] lg:block">My bookings</Link>
            <Link href="/login" className="text-[12px] font-medium text-[#51657F] transition-colors hover:text-[#0B63CE]">Log in</Link>
            <Link href="/signup" className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg bg-[#0B63CE] px-4 text-[12px] font-semibold text-white shadow-sm transition-colors hover:bg-[#0A3D91]">Sign up <ArrowRight size={13} /></Link>
          </>}
        </div>
        <details className="group relative md:hidden">
          <summary aria-label="Toggle navigation" className="flex h-10 w-10 cursor-pointer list-none items-center justify-center rounded-lg border border-[#D6E6F7] bg-white text-[#0B3F78] shadow-sm outline-none transition hover:bg-[#EAF4FF] focus-visible:ring-2 focus-visible:ring-[#0B63CE] focus-visible:ring-offset-2 [&::-webkit-details-marker]:hidden">
            <Menu size={20} className="group-open:hidden"/><X size={20} className="hidden group-open:block"/>
          </summary>
          <nav aria-label="Mobile navigation" className="absolute right-0 top-[calc(100%+0.5rem)] z-50 grid w-64 gap-1 rounded-xl border border-[#D6E6F7] bg-white p-2 text-sm text-[#0F2342] shadow-xl">
            <Link onClick={closeMobileMenu} className="rounded-lg px-3 py-2.5 hover:bg-[#EAF4FF]" href="/cars">Cars</Link>
            <Link onClick={closeMobileMenu} className="rounded-lg px-3 py-2.5 hover:bg-[#EAF4FF]" href="/#popular-trips">Popular trips</Link>
            <Link onClick={closeMobileMenu} className="rounded-lg px-3 py-2.5 hover:bg-[#EAF4FF]" href="/#how-it-works">How it works</Link>
            <Link onClick={closeMobileMenu} className="rounded-lg px-3 py-2.5 hover:bg-[#EAF4FF]" href="/for-owners">List your car</Link>
            <Link onClick={closeMobileMenu} className="rounded-lg px-3 py-2.5 hover:bg-[#EAF4FF]" href="/contact">Contact</Link>
            {userName ? <>
              <span className="flex items-center gap-3 rounded-xl border border-[#D6E6F7] bg-[#F5FAFF] px-3 py-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#0B63CE] text-sm font-semibold text-white shadow-sm">{userInitial}</span>
                <span className="min-w-0"><span className="block text-[10px] font-medium uppercase tracking-wide text-[#6D82A3]">Signed in</span><span className="block truncate text-sm font-semibold text-[#183B70]">{userName}</span></span>
              </span>
              <Link onClick={closeMobileMenu} className="rounded-lg px-3 py-2.5 font-semibold text-[#0B63CE] hover:bg-[#EAF4FF]" href="/account/bookings">My account and bookings</Link>
            </> : <>
              <Link onClick={closeMobileMenu} className="rounded-lg px-3 py-2.5 hover:bg-[#EAF4FF]" href="/account/bookings">My bookings</Link>
              <Link onClick={closeMobileMenu} className="rounded-lg px-3 py-2.5 hover:bg-[#EAF4FF]" href="/login">Log in</Link>
              <Link onClick={closeMobileMenu} className="mt-1 rounded-full bg-[#0B63CE] px-3 py-2.5 text-center font-semibold text-white" href="/signup">Sign up</Link>
            </>}
          </nav>
        </details>
      </div>
    </header>
  );
}

function closeMobileMenu(event: MouseEvent<HTMLAnchorElement>) {
  event.currentTarget.closest("details")?.removeAttribute("open");
}
