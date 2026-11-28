"use client";

import { ChevronLeft, RefreshCw } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { createContext, Suspense, useCallback, useContext, useEffect, useRef, useState, useTransition, type ReactNode } from "react";
import { toastError } from "@/lib/alerts/toast";
import { useConnectionStatus } from "@/lib/connection/provider";
import { ConnectionError, fetchWithTimeout, isOffline } from "@/lib/connection/request";
import { pageRoute } from "@/lib/page-routes";
import { PullToRefresh, useStandalone } from "./PullToRefresh";

const RefreshContext = createContext<{
  refresh: () => void;
  pending: boolean;
  offline: boolean;
  updated: string;
  refetchers: Set<() => Promise<unknown>>;
} | null>(null);

export function PageRefreshProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const offline = useConnectionStatus() === "offline";
  const [pending, startTransition] = useTransition();
  const [lastUpdate, setLastUpdate] = useState<{ path: string; time: string }>();
  const inFlight = useRef(false);
  const pendingRef = useRef(false);
  useEffect(() => { pendingRef.current = pending; }, [pending]);
  const [refetchers] = useState(() => new Set<() => Promise<unknown>>());
  const refresh = useCallback(() => {
    if (inFlight.current || pendingRef.current || isOffline()) return;
    inFlight.current = true;
    startTransition(async () => {
      try {
        const health = await fetchWithTimeout("/api/health", { cache: "no-store" });
        await health.body?.cancel();
        if (!health.ok) throw new ConnectionError("network");
        await Promise.all([...refetchers].map(refetch => refetch()));
        if (location.pathname !== pathname) return;
        startTransition(() => {
          router.refresh();
          setLastUpdate({ path: pathname, time: new Intl.DateTimeFormat("en-PH", {
            timeZone: "Asia/Manila", hour: "numeric", minute: "2-digit",
          }).format(new Date()) });
        });
      } catch (error) {
        void toastError(error);
      } finally {
        inFlight.current = false;
      }
    });
  }, [pathname, refetchers, router]);

  useEffect(() => {
    if (!lastUpdate || pending) return;
    const timer = window.setTimeout(() => setLastUpdate(undefined), 3000);
    return () => window.clearTimeout(timer);
  }, [lastUpdate, pending]);

  return <RefreshContext.Provider value={{ refresh, pending, offline, updated: !pending && lastUpdate?.path === pathname ? lastUpdate.time : "", refetchers }}>
    <PullToRefresh refresh={refresh} refreshing={pending} disabled={offline} />
    {children}
  </RefreshContext.Provider>;
}

export function usePageRefetch(refetch: () => Promise<unknown>) {
  const refetchers = useContext(RefreshContext)?.refetchers;
  useEffect(() => {
    if (!refetchers) return;
    refetchers.add(refetch);
    return () => { refetchers.delete(refetch); };
  }, [refetch, refetchers]);
}

function sameAppHistory() {
  const navigation = (window as Window & { navigation?: {
    entries(): { url: string | null }[]; currentEntry: { index: number } | null;
  } }).navigation;
  const previous = navigation
    ? navigation.entries()[(navigation.currentEntry?.index ?? 0) - 1]?.url
    : history.length > 1 ? document.referrer : null;
  return Boolean(previous && new URL(previous).origin === location.origin);
}

function RouteHeader({ surface }: { surface: "workspace" | "site" }) {
  const pathname = usePathname();
  const search = useSearchParams();
  const router = useRouter();
  const installed = useStandalone();
  const state = useContext(RefreshContext);
  const route = pageRoute(pathname, new URLSearchParams(search));
  const workspace = /^\/(owner|admin)(\/|$)/.test(pathname);
  const account = /^\/(account|notifications|staff|receipt|p)(\/|$)/.test(pathname);
  if (!route || !state || workspace !== (surface === "workspace") || (!workspace && !account && !installed)) return null;

  function back() {
    if (!route?.parent) return;
    const proofStep = /\/pay$/.test(pathname) && search.get("step") === "proof" && !document.querySelector("[data-payment-closed]");
    if (proofStep && history.state?.kuyogPaymentStep && history.length > 1) router.back();
    else if (proofStep) router.replace(route.parent.href);
    else if (sameAppHistory()) router.back();
    else {
      const parent = document.querySelector("[data-payment-closed]") ? "/account/bookings"
        : document.querySelector<HTMLAnchorElement>("[data-page-parent]")?.getAttribute("href") ?? route.parent.href;
      router.replace(parent);
    }
  }

  const control = "inline-flex min-h-11 min-w-11 items-center rounded-lg text-[#0A3D91] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0A47B1]";
  return <header data-page-header={surface} className={`border-b border-[#E3EEF9] bg-white font-body text-[#0F2342] print:hidden ${surface === "site" ? "sticky top-0 z-40 pt-[env(safe-area-inset-top)]" : ""}`}>
    <div className="mx-auto grid min-h-14 max-w-[1440px] grid-cols-[minmax(0,1fr)_minmax(0,2fr)_minmax(0,1fr)] items-center gap-1 px-3">
      {route.parent && <button type="button" aria-label="Back" onClick={back} className={`${control} justify-self-start pr-1 text-[13px] font-semibold`}>
        <ChevronLeft size={19} className="shrink-0" aria-hidden /><span className="payment-active-label">{route.parent.label}</span>
        {/\/pay$/.test(pathname) && <span className="payment-closed-label hidden">Bookings</span>}
      </button>}
      <p className="col-start-2 text-center font-heading text-base font-bold leading-tight"><span className="payment-active-label">{route.title}</span>
        {/\/pay$/.test(pathname) && <span className="payment-closed-label hidden">Booking payment</span>}</p>
      <button type="button" aria-label="Refresh" disabled={state.pending || state.offline} onClick={state.refresh}
        className={`${control} col-start-3 justify-center justify-self-end disabled:opacity-50`}>
        <RefreshCw size={18} aria-hidden className={state.pending ? "motion-safe:animate-spin" : undefined} />
      </button>
    </div>
    <div role="status" className={state.updated ? "pb-2 text-center text-[13px] text-[#12703A]" : "sr-only"}>
      {state.pending ? "Refreshing…" : state.updated ? `Updated ${state.updated}` : ""}
    </div>
  </header>;
}

export function PageHeader({ surface }: { surface: "workspace" | "site" }) {
  return <Suspense fallback={null}><RouteHeader surface={surface} /></Suspense>;
}
