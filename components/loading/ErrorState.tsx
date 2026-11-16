"use client";
import { Button } from "@/components/ui/button";

export function ErrorState({ message = "Something went wrong.", onRetry }: { message?: string; onRetry?: () => void }) {
  return <div role="alert" className="grid place-items-center gap-3 rounded-3xl border border-[#D6E6F7] p-10 text-center"><p className="font-semibold text-[#0F2342]">{message}</p>{onRetry && <Button onClick={onRetry}>Try again</Button>}</div>;
}
