"use client";

import { createContext, useContext, useEffect, useRef, useSyncExternalStore, type ReactNode } from "react";
import { WifiOff } from "lucide-react";
import { backOnlineToast, slowConnectionToast } from "@/lib/alerts/toast";
import { isOffline } from "./request";

type Status = "online" | "offline" | "slow";
type NetworkInformation = EventTarget & { effectiveType?: string; downlink?: number };
const Context = createContext<Status>("online");

function networkInformation() {
  return (navigator as Navigator & { connection?: NetworkInformation }).connection;
}

function status(): Status {
  if (isOffline()) return "offline";
  const info = networkInformation();
  return info && (/^(slow-)?2g$/.test(info.effectiveType ?? "") || (info.downlink ?? Infinity) < 0.4) ? "slow" : "online";
}

function subscribe(update: () => void) {
  const info = networkInformation();
  window.addEventListener("online", update);
  window.addEventListener("offline", update);
  info?.addEventListener("change", update);
  return () => {
    window.removeEventListener("online", update);
    window.removeEventListener("offline", update);
    info?.removeEventListener("change", update);
  };
}

export function ConnectionProvider({ children }: { children: ReactNode }) {
  const current = useSyncExternalStore(subscribe, status, (): Status => "online");
  const previous = useRef<Status>("online");
  useEffect(() => {
    if (previous.current === "offline" && current !== "offline") void backOnlineToast();
    else if (current === "slow") void slowConnectionToast();
    previous.current = current;
  }, [current]);
  return <Context.Provider value={current}>{children}</Context.Provider>;
}

export function useConnectionStatus() {
  return useContext(Context);
}

export function OfflineBanner() {
  const offline = useConnectionStatus() === "offline";
  return <div role="status" aria-live="polite" aria-atomic="true">
    {offline && <div className="flex items-start justify-center gap-3 border-y border-[#F1D798] bg-[#FFF2D6] px-4 py-2.5 font-body text-sm text-[#8A5A00]">
      <WifiOff className="mt-0.5 size-5 shrink-0" aria-hidden />
      <div><p className="font-heading font-bold">You&apos;re offline</p>
        <p>Check your Wi-Fi or mobile data. We&apos;ll reconnect automatically.</p></div>
    </div>}
  </div>;
}
