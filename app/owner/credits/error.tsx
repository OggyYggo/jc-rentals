"use client";

import { useEffect } from "react";
import { captureException } from "@sentry/nextjs";
import { ErrorState } from "@/components/loading/ErrorState";

export default function Error({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => { if (!error.digest) captureException(error); }, [error]);
  return <main className="mx-auto w-full max-w-2xl px-5 py-16"><ErrorState variant="connection" message="Couldn't load credits" onRetry={retry} /></main>;
}
