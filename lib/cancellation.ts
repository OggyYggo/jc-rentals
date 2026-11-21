export const refundOwnerCopy = "The refund is sent by the vehicle owner. Kuyog Bohol helps record and track it.";
export const cancellableStatuses = ["awaiting_payment", "payment_review", "confirmed"];

export function refundSupportCopy(days: number) {
  return `The owner sends your refund to the account you paid from. Contact support if you haven't received it within ${days} days.`;
}

export function cancellationRule(hours: number, percent: number) {
  return `Cancel at least ${hours} hours before pickup for a full refund. After the cutoff, the owner keeps ${percent}% of your verified reservation payment.`;
}

export function formatCutoff(date: string) {
  return new Intl.DateTimeFormat("en-PH", { timeZone: "Asia/Manila", dateStyle: "medium", timeStyle: "short" }).format(new Date(date)) + " (Manila time)";
}

export function refundMoney(amount: number) {
  return new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" }).format(amount);
}

export type CancellationSnapshot = {
  cancel_free_until: string | null;
  cancel_fee_percent: number | null;
  amount_paid_online: number;
};
