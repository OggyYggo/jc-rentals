export const staffAbilities = [
  "Scan a pickup pass or enter its six-digit backup code",
  "Check ID and confirm handover after collecting any balance",
  "Confirm vehicle returns",
  "See today’s pickups and returns for this business",
];

export const staffRestrictions = [
  "Payments, refunds, credits, fees and invoices",
  "Vehicle editing, rates and business settings",
  "Customer documents, contact details and other businesses’ bookings",
];

export const staffResponsibility = "You are responsible for anyone you invite to hand over vehicles for you.";
export const staffStatuses = {
  active: { label: "Active", tone: "bg-[#E3F7EA] text-[#12703A]" },
  invited: { label: "Invited", tone: "bg-[#FFF2D6] text-[#8A5A00]" },
  paused: { label: "Paused", tone: "bg-slate-100 text-slate-700" },
  removed: { label: "Removed", tone: "bg-[#FDE8E8] text-[#A12A2A]" },
} as const;

export const staffErrors: Record<string, string> = {
  STAFF_LIMIT: "Remove someone before inviting another staff member.",
  STAFF_DUPLICATE: "This email already has access or an invitation for this business.",
  STAFF_INVALID_DETAILS: "Enter a name and a valid email address.",
  STAFF_INVITE_RATE: "You’ve reached today’s invitation limit. Try again tomorrow.",
  STAFF_NOT_ALLOWED: "This change is no longer available. Refresh and try again.",
  STAFF_INVITE_INVALID: "This invitation is expired or already used. Ask the owner for a new one.",
  STAFF_INVITE_ACCOUNT: "Use a verified customer account with the email address on this invitation.",
};

export function staffError(code: string) {
  return Object.hasOwn(staffErrors, code) ? staffErrors[code] : "Could not complete the request. Try again.";
}

export function staffAcceptPath(value: string | null | undefined) {
  return value && /^\/staff\/accept\?token=[a-f0-9]{64}$/.test(value) ? value : null;
}
