import { pickupPathPattern, type PickupCredential, type PickupLookup } from "./model";

export function pickupScanToken(value: string, origins: string[]) {
  try {
    const url = new URL(value.trim());
    return origins.includes(url.origin) && pickupPathPattern.test(url.pathname) &&
      !url.search && !url.hash && !url.username && !url.password ? url.pathname.slice(3) : null;
  } catch { return null; }
}

export async function requestPickupLookup(credential: PickupCredential) {
  const response = await fetch("/api/pickup/lookup", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(credential),
  });
  if (!response.ok) throw new Error("Pickup lookup failed");
  return await response.json() as PickupLookup;
}
