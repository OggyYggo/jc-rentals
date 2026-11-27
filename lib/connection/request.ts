export class ConnectionError extends Error {
  readonly kind: "offline" | "timeout" | "network";
  readonly sent: boolean;

  constructor(kind: ConnectionError["kind"], sent = false) {
    super(kind);
    this.name = "ConnectionError";
    this.kind = kind;
    this.sent = sent;
  }
}

export function isOffline() {
  return typeof navigator !== "undefined" && navigator.onLine === false;
}

export function connectionError(error: unknown) {
  if (error instanceof ConnectionError) return error;
  const message = error instanceof Error ? error.message :
    typeof error === "object" && error && "message" in error ? String(error.message) : "";
  if (/failed to fetch|fetch failed|network\s?error|network request failed|load failed/i.test(message)) {
    return new ConnectionError("network", true);
  }
  return null;
}

export async function fetchWithTimeout(input: RequestInfo | URL, init: RequestInit = {}, options: {
  timeoutMs?: number; payment?: boolean;
} = {}) {
  if (isOffline()) throw new ConnectionError("offline");
  const request = input instanceof Request ? input : undefined;
  const method = (init.method ?? request?.method ?? "GET").toUpperCase();
  const timeoutMs = options.timeoutMs ?? (options.payment ? 45_000 : /^(GET|HEAD)$/.test(method) ? 15_000 : 30_000);
  const callerSignal = init.signal ?? request?.signal;
  callerSignal?.throwIfAborted();
  const controller = new AbortController();
  const signal = callerSignal ? AbortSignal.any([controller.signal, callerSignal]) : controller.signal;
  // Wrap the response stream so the deadline also covers reading its body.
  function stop() { clearTimeout(timeout); }
  const timeout = setTimeout(() => controller.abort(new ConnectionError("timeout", true)), timeoutMs);
  function failure() {
    return signal.aborted ? signal.reason : new ConnectionError(isOffline() ? "offline" : "network", true);
  }
  try {
    const response = await fetch(input, { ...init, signal });
    if (!response.body) {
      stop();
      return response;
    }
    const reader = response.body.getReader();
    const body = new ReadableStream<Uint8Array>({
      async pull(stream) {
        try {
          const chunk = await reader.read();
          if (chunk.done) { stop(); stream.close(); }
          else stream.enqueue(chunk.value);
        } catch { stop(); stream.error(failure()); }
      },
      cancel(reason) { stop(); return reader.cancel(reason); },
    });
    return new Response(body, response);
  } catch {
    stop();
    throw failure();
  }
}

export async function withConnectionDeadline<T>(request: (signal: AbortSignal) => PromiseLike<T>, timeoutMs = 30_000): Promise<T> {
  if (isOffline()) throw new ConnectionError("offline");
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          const error = new ConnectionError("timeout", true);
          reject(error);
          controller.abort(error);
        }, timeoutMs);
      }),
      request(controller.signal),
    ]);
  } catch (error) {
    throw connectionError(error) ?? error;
  } finally {
    clearTimeout(timer);
  }
}
