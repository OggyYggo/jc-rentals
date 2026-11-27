import { ConnectionError } from "@/lib/connection/request";
import { pickupErrors } from "@/lib/pickup/model";

const safeMessages = new Set([
  "Payment option not found.",
  "The payment option changed. Refresh and review the current QR.",
  "Choose a QR image uploaded to your account.",
  "Enter a label and account name without an account number.",
  "You already have an active option for this provider.",
  "You can have up to 8 active payment options.",
  "Refresh the page and reorder your current payment options.",
  "Keep one verified option while bookings are awaiting payment.",
  "Enter a rejection reason (up to 300 characters).",
  "The active payment option or its QR image could not be found.",
  "This application is no longer pending.",
  "Could not check for an existing account.",
  "Could not send the account invitation.",
  "Could not update this application.",
  "The account exists, but the owner profile could not be created. Contact support before retrying.",
  "The profile exists, but the owner record could not be created. Contact support before retrying.",
  "The owner was created, but their Starter plan could not be initialized. Contact support before retrying.",
  "The owner was created, but the draft vehicle could not be created. Contact support before retrying.",
  "The owner was created, but the draft vehicle rates could not be saved. Contact support before retrying.",
  "The owner account and draft vehicle were created, but the application status could not be updated.",
  "This booking can no longer be cancelled.",
  "Customers can only cancel before the rental starts.",
  "This booking status change is not allowed. Record the pickup balance before marking it picked up.",
  "Payment not found or already processed.",
  "Booking is not waiting for payment review.",
  "Payment cannot be recorded for this booking.",
  "This booking has no refund waiting to be marked.",
  "Booking not found.",
  "A no-show can only be recorded on or after the rental start date.",
  "Use at most 80 characters for the refund reference.",
  "Use at most two decimal places.",
  "Enter a cancellation fee from 0 to 100 percent.",
  "Pending top-up not found.",
  "Enter a valid top-up amount and transfer reference.",
  "Upload a valid top-up proof for this owner.",
  "That top-up reference or proof has already been used.",
  "Enter the amount and reference from the verified transfer.",
  "Unpaid invoice not found.",
  "Pending payment not found.",
  "This booking is no longer pending or is unavailable.",
  "Customer profile not found.",
  "Owner not found.",
  "This owner is archived or unavailable.",
  "Please give a reason (3 to 300 characters).",
  "A plan payment is already waiting for review.",
  "Daily payment submission limit reached.",
  "Owner QR setup is incomplete or owner was not found.",
  "You already have a payment waiting for review.",
  "That transaction reference has already been used. Check it and try again.",
  "Please sign in again to submit payment.",
  "We could not upload your proof. Please try again.",
  "Could not open the document. Please try again.",
  "Copy was blocked by your browser. Select and copy the text instead.",
  "Could not open the share sheet.",
  "Payment is no longer waiting for review.",
  "A sent refund is required.",
  "Refund is not pending.",
  "Enter a refund reference.",
  "Upload refund proof first.",
  "Choose a JPEG, PNG or WebP image up to 5 MB.",
  "Could not convert this image to WebP.",
  "Enter a resolution of 10 to 500 characters.",
  "Disputes are available two hours after submitting proof, or after rejection or expiry.",
  "This reservation payment is already confirmed.",
  "Dispute is unavailable.",
  "Dispute is not open.",
  "Check the payment setting ranges.",
  "Both verification documents are required.",
  "Enter a reason of 5 to 300 characters.",
]);

export function friendlyError(error: unknown): { title: string; text: string; action?: { label: string; href: string } } {
  if (error instanceof ConnectionError) {
    if (error.kind === "offline") return { title: "You're offline", text: "Needs internet to continue." };
    if (error.kind === "timeout") return { title: "This is taking too long", text: "Check your connection and try again." };
    return { title: "Connection problem", text: "We could not reach the server. Check your connection and try again." };
  }
  const message = typeof error === "string" ? error
    : error && typeof error === "object" && "message" in error && typeof error.message === "string" ? error.message : "";
  const code = error && typeof error === "object" && "code" in error ? error.code : undefined;
  if (/\b(?:CAR|VEHICLE)_LIMIT_REACHED\b/.test(message) || code === "CAR_LIMIT_REACHED" || code === "VEHICLE_LIMIT_REACHED") {
    return {
      title: "Vehicle plan limit reached",
      text: "You have reached your plan limit. Upgrade your plan to publish more vehicles.",
      action: { label: "View plans", href: "/owner/plan" },
    };
  }
  if (/\bLICENSE_CLASS_REQUIRED\b/.test(message) || code === "LICENSE_CLASS_REQUIRED") {
    return { title: "License class required", text: "This customer's license is not verified for this vehicle type." };
  }
  if (code === "42501" || /^(?:Administrator access required|Not allowed)\.?$/i.test(message)) {
    return { title: "Permission required", text: "You do not have permission to do this." };
  }
  if (/failed to fetch|fetch failed|network\s?error|network request failed|load failed/i.test(message)) {
    return { title: "Connection problem", text: "We could not reach the server. Check your connection and try again." };
  }
  if (Object.hasOwn(pickupErrors, message)) return { title: "Pickup pass", text: pickupErrors[message] };
  if (message === "ATTESTATION_MISMATCH") return { title: "Check the transfer details", text: "The amount and transaction reference must both match the proof." };
  if (message === "ADMIN_NOTE_REQUIRED") return { title: "Reason required", text: "Enter an audit reason of at least ten characters." };
  if (message === "PAYMENT_REVIEW_EXPIRED") return { title: "Review window closed", text: "Refresh the queue and check the refund status." };
  if (message.startsWith("Top up your owner credits")) return { title: "Owner credits short", text: message, action: { label: "Top up", href: "/owner/credits" } };
  if (code === "23505" && message.includes("payment_disputes_one_open")) return { title: "Dispute already open", text: "Support is already reviewing this issue." };
  if (code === "23505" && message.includes("plan_payments_reference_unique")) {
    return { title: "Reference already used", text: "That transaction reference has already been used. Check it and try again." };
  }
  return { title: "Action could not be completed", text: safeMessages.has(message) ? message : "Something went wrong. Please try again." };
}

export function friendlyPaymentError(error: unknown): string {
  const message = error && typeof error === "object" && "message" in error ? String(error.message) : "";
  const code = error && typeof error === "object" && "code" in error ? error.code : undefined;
  if (message === "REFERENCE_INVALID") return "Enter a wallet or bank reference with 6 to 40 letters or digits.";
  if (message === "PAYMENT_OPTION_UNAVAILABLE") return "That payment option is no longer available. Refresh the page and check your transfer before trying again.";
  if (message === "REFERENCE_ALREADY_USED" || code === "23505") return "That transaction reference has already been used. Check your transfer history.";
  if (/PAYMENT_WINDOW_EXPIRED|payment window has expired/i.test(message)) return "The payment window has passed. If you already paid, contact support.";
  if (message === "PROOF_LIMIT") return "This booking has reached its three-proof limit.";
  if (/exact deposit amount/i.test(message)) return "The deposit amount changed. Refresh the page before sending proof.";
  if (/not accepting|already under review/i.test(message)) return "Check the current payment status before submitting another proof.";
  if (/failed to fetch|network|connection|load failed/i.test(message)) return "We couldn’t check your payment status. Reconnect and check your booking before trying again.";
  if (/proof file path|upload/i.test(message)) return "We couldn’t upload the screenshot. Try a JPEG, PNG or WebP image up to 5 MB.";
  return "We couldn’t submit your proof. Check your booking before trying again.";
}
