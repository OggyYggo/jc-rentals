import * as Sentry from "@sentry/nextjs";
import { config } from "zod/v4/core";
import { monitoringOptions } from "@/lib/monitoring/sentry";

// Keep browser validation compatible with a policy that disallows eval.
config({ jitless: true });

if (process.env.NEXT_PUBLIC_SENTRY_DSN) {
  Sentry.init({
    ...monitoringOptions(process.env.NEXT_PUBLIC_SENTRY_DSN, "client"),
    integrations: [Sentry.globalHandlersIntegration()],
  });
}
