export const pickupTokenPattern = /^[a-f0-9]{64}$/;
export const pickupPathPattern = /^\/p\/[a-f0-9]{64}$/;
export const pickupCodePattern = /^[0-9]{6}$/;
export const bookingIdPattern = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;

export type PickupPass = {
  state: "not_ready" | "ready" | "today" | "return_ready" | "used" | "expired" | "cancelled";
  reference: string; vehicle_label: string; mode: string;
  start_date: string; end_date: string; pickup_time: string | null;
  balance_at_pickup: number; deposit_amount: number; valid_from: string; valid_until: string;
  used_at: string | null; token?: string; backup_code?: string; rotations?: number;
};

export type PickupCredential = { token: string; code?: never } | { token?: never; code: string };

type PickupFacts = {
  booking_id: string; reference: string; customer_name: string; vehicle_label: string; plate: string | null;
  start_date: string; end_date: string; mode: string; payment: string;
  balance_at_pickup: number; deposit_amount: number; license_ok: boolean; id_ok: boolean;
  docs_required: boolean; documents_verified: boolean; pickup_today: boolean; stage: "pickup" | "return";
};

export type PickupLookup =
  | { result: "NOT_VALID" }
  | { result: "LOCKED"; retry_after_seconds: number }
  | { result: "ALREADY_USED"; used_at: string | null }
  | ({ result: "OK" | "NOT_TODAY" | "DOCS_NOT_VERIFIED" } & PickupFacts);

export const pickupErrors: Record<string, string> = {
  PASS_NOT_VALID: "This pickup pass is no longer valid. Ask the customer to open their current pass.",
  ALREADY_USED: "This pickup pass was already used.",
  NOT_TODAY: "Enter a reason for a handover outside the pickup window.",
  DOCS_NOT_VERIFIED: "Ask the customer to complete verification or contact Kuyog Bohol support.",
  ID_CHECK_REQUIRED: "Check the customer’s ID before confirming handover.",
  BALANCE_REQUIRED: "Confirm that you received the balance and select the payment method.",
  OVERRIDE_REASON_REQUIRED: "Enter a reason of 5 to 200 characters.",
  ROTATION_LIMIT: "You’ve reached the replacement limit for this pass. Contact support for help.",
  LOCKED: "Too many attempts. Wait before trying again.",
  RETURN_NOT_ENABLED: "Return scans are currently unavailable. Use the booking controls.",
};

export function pickupError(error: unknown) {
  const code = error && typeof error === "object" && "message" in error ? String(error.message) : "";
  return (Object.hasOwn(pickupErrors, code) ? pickupErrors[code] : undefined) ?? "Could not complete the request. Check your connection and try again.";
}
