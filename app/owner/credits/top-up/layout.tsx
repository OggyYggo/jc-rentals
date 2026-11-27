import type { ReactNode } from "react";
import { TopUpViewport } from "@/components/owner/mobile-credits/navigation";

export default function TopUpLayout({ children }: { children: ReactNode }) {
  return <TopUpViewport>{children}</TopUpViewport>;
}
