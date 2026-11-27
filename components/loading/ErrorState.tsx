"use client";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { useConnectionStatus } from "@/lib/connection/provider";

export function ErrorState({ message = "Something went wrong.", onRetry, variant }: {
  message?: string; onRetry?: () => void; variant?: "connection";
}) {

  const offline = useConnectionStatus() === "offline";

  return <section role="alert" className="grid place-items-center gap-3 rounded-3xl border border-[#D6E6F7] bg-white p-6 text-center">
    <h2 className="font-heading font-semibold text-[#0F2342]">{message}</h2>
    {variant === "connection" && <p className="text-sm text-[#5B6F89]">Check your connection and try again.</p>}
    {onRetry ? <Button type="button" className="min-h-11" onClick={onRetry} disabled={offline}>{offline ? "Needs internet to continue" : "Try again"}</Button> : variant === "connection" && <RefreshButton />}
  </section>;
}


function RefreshButton() {
  const router = useRouter();
  const offline = useConnectionStatus() === "offline";
  return <Button type="button" className="min-h-11" disabled={offline} onClick={() => router.refresh()}>{offline ? "Needs internet to continue" : "Try again"}</Button>;
}
