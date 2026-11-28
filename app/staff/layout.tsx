import type { ReactNode } from "react";

export const metadata = { robots: { index: false, follow: false }, referrer: "no-referrer" };

export default function StaffLayout({ children }: { children: ReactNode }) {
  return <div className="min-h-screen bg-[#F3F9FF]">{children}</div>;
}
