import type { Event } from "@sentry/nextjs";
type ErrorEvent = Event & { type: undefined };

export function monitoringOptions(dsn: string | undefined, runtime: "client" | "server") {
  return {
    dsn,
    sendDefaultPii: false,
    tracesSampleRate: 0,
    sendClientReports: false,
    // Opt in only to error capture. Exclude breadcrumbs, requests, sessions, and tracing.
    defaultIntegrations: false as const,
    beforeSend(event: ErrorEvent): ErrorEvent {
      return {
        type: undefined,
        event_id: event.event_id,
        timestamp: event.timestamp,
        level: "error",
        tags: { runtime },
        exception: {
          values: [{
            type: "Error",
            value: runtime === "client" ? "Application error in browser" : "Application error on server",
            stacktrace: {
              frames: (event.exception?.values?.at(-1)?.stacktrace?.frames ?? []).flatMap(frame => {
                // Keep only generated asset names and positions. Strip origin, path, and function text.
                const filename = frame.filename?.match(/\/(?:_next\/static\/chunks|\.next\/server\/chunks(?:\/ssr)?)\/([a-z0-9._~-]+\.js)(?:[?#].*)?$/i)?.[1];
                return filename ? [{ filename, lineno: frame.lineno, colno: frame.colno, in_app: true }] : [];
              }),
            },
          }],
        },
      };
    },
  };
}
