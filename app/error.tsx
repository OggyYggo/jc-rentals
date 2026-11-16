"use client";

import { useEffect } from "react";
import { ErrorState } from "@/components/loading/ErrorState";

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { console.error(error); }, [error]);
  return <main className="mx-auto w-full max-w-2xl px-5 py-16"><ErrorState message="We couldn't load this page." onRetry={reset} /></main>;
}
