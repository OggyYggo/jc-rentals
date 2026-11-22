import { pickupPathPattern } from "@/lib/pickup/model";

export const googleNextCookie = "kb-google-next";

export function pickupReturnPath(value: string | null | undefined) {
  return value && (pickupPathPattern.test(value) || /^\/account\/bookings\/[a-f0-9-]{36}\/pickup$/i.test(value)) ? value : null;
}

export function accountReturnPath(value: string | null | undefined) {
  return pickupReturnPath(value) ?? (value === "/account/profile" ? value : "/account/bookings");
}
