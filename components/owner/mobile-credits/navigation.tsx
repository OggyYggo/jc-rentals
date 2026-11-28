"use client";

import { ChevronLeft } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { creditsHref, focus, topUpHref } from "./styles";

export function CreditsHeading({ back, href, title, description, history }: {
  back: string; href: string; title: string; description: string; history?: boolean;
}) {
  const router = useRouter();
  return <header>
    <Link data-page-parent href={href} onClick={history ? event => {
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      // The Navigation API distinguishes an in-app entry from a fresh tab.
      const navigation = (window as Window & {
        navigation?: { entries(): { url: string | null }[]; currentEntry: { index: number } | null };
      }).navigation;
      const previous = navigation?.entries()[(navigation.currentEntry?.index ?? 0) - 1];
      const referrer = !navigation && window.history.length > 1 ? document.referrer : "";
      const previousUrl = previous?.url || referrer ? new URL(previous?.url || referrer) : null;
      if (previousUrl?.origin === location.origin && previousUrl.pathname.startsWith("/owner") &&
          previousUrl.pathname !== location.pathname) {
        event.preventDefault();
        router.back();
      }
    } : undefined} className={`inline-flex min-h-11 items-center gap-1 rounded-lg text-sm font-semibold text-[#0A47B1] ${focus}`}>
      <ChevronLeft size={18} aria-hidden />{back}
    </Link>
    <h1 className="font-heading text-[28px] font-bold tracking-tight">{title}</h1>
    <p className="mt-1 text-sm text-[#5B6F89]">{description}</p>
  </header>;
}

export function TopUpViewport({ children }: { children: ReactNode }) {
  const router = useRouter();
  useEffect(() => {
    const desktop = window.matchMedia("(min-width: 64rem)");
    function redirectDesktop() {
      if (desktop.matches) router.replace(`${creditsHref}#top-up`);
    }
    redirectDesktop();
    desktop.addEventListener("change", redirectDesktop);
    return () => desktop.removeEventListener("change", redirectDesktop);
  }, [router]);
  return children;
}

export function MobileTopUpAnchor() {
  const router = useRouter();
  useEffect(() => {
    function redirectMobile() {
      if (location.hash === "#top-up" && !window.matchMedia("(min-width: 64rem)").matches) {
        router.replace(topUpHref);
      }
    }
    redirectMobile();
    window.addEventListener("hashchange", redirectMobile);
    return () => window.removeEventListener("hashchange", redirectMobile);
  }, [router]);
  return null;
}
