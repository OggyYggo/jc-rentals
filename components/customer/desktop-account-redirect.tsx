"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export function DesktopAccountRedirect() {
  const router = useRouter();
  useEffect(() => {
    const desktop = window.matchMedia("(min-width: 768px)");
    const openBookings = () => { if (desktop.matches) router.replace("/account/bookings"); };
    openBookings();
    desktop.addEventListener("change", openBookings);
    return () => desktop.removeEventListener("change", openBookings);
  }, [router]);
  return null;
}
