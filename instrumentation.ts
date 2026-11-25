import type { Instrumentation } from "next";
import * as Sentry from "@sentry/nextjs";
import { monitoringOptions } from "@/lib/monitoring/sentry";

export function register() {
  Sentry.init(monitoringOptions(process.env.SENTRY_DSN ?? process.env.NEXT_PUBLIC_SENTRY_DSN, "server"));
}

export const onRequestError: Instrumentation.onRequestError = async error => {
  Sentry.captureException(error);
  await Sentry.flush(2000);
};
