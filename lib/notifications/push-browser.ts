import { fetchWithTimeout } from "@/lib/connection/request";

export type DevicePushState = "mine" | "other" | "none";
export type PushDevice = {
  id: string; name: string; kind: "phone" | "computer"; created_at: string; last_used_at: string | null; current: boolean;
};

export class PushRequestError extends Error {
  constructor(readonly status: number) { super("Push request failed"); }
}

async function requestPush<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetchWithTimeout(path, { ...options, cache: "no-store" });
  if (!response.ok) throw new PushRequestError(response.status);
  return response.json() as Promise<T>;
}

export async function browserPushSubscription() {
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) return null;
  const registration = await navigator.serviceWorker.getRegistration("/");
  return (await registration?.pushManager.getSubscription()) ?? null;
}

function withEndpoint(path: string, endpoint?: string) {
  return endpoint ? `${path}?endpoint=${encodeURIComponent(endpoint)}` : path;
}

export async function pushState(endpoint?: string, signal?: AbortSignal): Promise<DevicePushState> {
  const { state } = await requestPush<{ state: DevicePushState }>(withEndpoint("/api/push/subscribe", endpoint), { signal });
  return state;
}

export async function pushDevices(endpoint?: string, signal?: AbortSignal) {
  const { devices } = await requestPush<{ devices: PushDevice[] }>(withEndpoint("/api/push/devices", endpoint), { signal });
  return devices;
}

export function removePushDevice(id: string, endpoint?: string) {
  return requestPush<{ removed: boolean }>("/api/push/devices", json("DELETE", { id, endpoint }));
}

function json(method: "POST" | "DELETE", value: unknown): RequestInit {
  return { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(value) };
}

export async function stopPushAlerts(subscription: PushSubscription) {
  const { removed } = await requestPush<{ removed: boolean }>("/api/push/subscribe", json("DELETE", { endpoint: subscription.endpoint }));
  if (removed || await pushState(subscription.endpoint) === "none") {
    // The account is detached even if the browser cannot revoke the local subscription.
    await subscription.unsubscribe().catch(() => {});
  }
}

export function registerPushAlerts(subscription: PushSubscription, transfer = false) {
  return requestPush("/api/push/subscribe", json("POST", { ...subscription.toJSON(), transfer }));
}

export function standalonePushDisplay() {
  return window.matchMedia("(display-mode: standalone)").matches || Boolean((navigator as Navigator & { standalone?: boolean }).standalone);
}

export function pushEnvironment() {
  const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const supported = "Notification" in window && "serviceWorker" in navigator && "PushManager" in window;
  return { ios, installed: standalonePushDisplay(), supported, blocked: "Notification" in window && Notification.permission === "denied" };
}

export async function subscribeBrowserPush(publicKey: string) {
  if (!publicKey) throw new PushRequestError(503);
  const permission = Notification.permission === "granted" ? "granted" : await Notification.requestPermission();
  if (permission !== "granted") return null;
  const registration = await navigator.serviceWorker.register("/sw.js");
  const current = await registration.pushManager.getSubscription();
  if (current) return current;
  const padded = publicKey.padEnd(Math.ceil(publicKey.length / 4) * 4, "=").replace(/-/g, "+").replace(/_/g, "/");
  const applicationServerKey = Uint8Array.from(window.atob(padded), character => character.charCodeAt(0));
  return registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey });
}
