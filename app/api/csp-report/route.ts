const directives = new Set([
  "base-uri", "connect-src", "default-src", "font-src", "form-action", "frame-ancestors",
  "frame-src", "img-src", "manifest-src", "media-src", "object-src", "script-src",
  "script-src-attr", "script-src-elem", "style-src", "style-src-attr", "style-src-elem", "worker-src",
]);

export async function POST(request: Request) {
  if (!request.headers.get("content-type")?.startsWith("application/csp-report")) {
    return new Response(null, { status: 415 });
  }
  const reader = request.body?.getReader();
  if (!reader) return new Response(null, { status: 400 });

  const decoder = new TextDecoder();
  let size = 0;
  let body = "";
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 8192) {
        await reader.cancel();
        return new Response(null, { status: 413 });
      }
      body += decoder.decode(value, { stream: true });
    }
    const { "csp-report": report } = JSON.parse(body + decoder.decode());
    const directive = report?.["effective-directive"];
    if (directives.has(directive)) {
      // Only retain allowlisted directive names. Browser reports can contain sensitive URLs.
      console.warn("CSP violation", directive);
    }
    return new Response(null, { status: 204 });
  } catch {
    return new Response(null, { status: 400 });
  }
}
