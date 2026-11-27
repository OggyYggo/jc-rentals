export function trustedPushEndpoint(value: string): string | null {
  if (!value || value.length > 4096) return null;
  const url = URL.parse(value);
  if (!url || url.protocol !== "https:" || url.port || url.username || url.password || url.hash) return null;
  const host = url.hostname;
  if (host === "fcm.googleapis.com" || host === "updates.push.services.mozilla.com" ||
      host.endsWith(".push.apple.com") || host.endsWith(".notify.windows.com")) return url.href;
  return null;
}
