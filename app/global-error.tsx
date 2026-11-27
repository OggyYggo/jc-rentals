"use client";

import { useEffect } from "react";
import { captureException } from "@sentry/nextjs";
import { ConnectionProvider, OfflineBanner } from "@/lib/connection/provider";
import { ErrorState } from "@/components/loading/ErrorState";

export default function GlobalError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    if (!error.digest) captureException(error);
  }, [error]);

  return <html lang="en">
    <body>
      <ConnectionProvider>
        <OfflineBanner />
        <main className="mx-auto max-w-2xl px-5 py-16">
          <ErrorState variant="connection" message="We couldn't load Kuyog Bohol." onRetry={retry} />
        </main>
      </ConnectionProvider>
    </body>
  </html>;
}
