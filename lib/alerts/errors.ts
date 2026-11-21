const safeMessages = new Set([
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
]);

export function friendlyError(error: unknown): { title: string; text: string; action?: { label: string; href: string } } {
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
  if (code === "23505" && message.includes("plan_payments_reference_unique")) {
    return { title: "Reference already used", text: "That transaction reference has already been used. Check it and try again." };
  }
  return { title: "Action could not be completed", text: safeMessages.has(message) ? message : "Something went wrong. Please try again." };
}
