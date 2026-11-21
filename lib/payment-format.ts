export function normalizePaymentReference(reference: string) {
  return reference.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
}

export function paymentDate(value: string) {
  return new Date(value).toLocaleString("en-PH", { timeZone: "Asia/Manila", dateStyle: "medium", timeStyle: "short" });
}

export function paymentPeso(value: number) {
  return new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" }).format(value);
}

export const safetyDepositCopy = "Held by the owner and refundable after the vehicle is returned in good condition. Not part of this online payment.";
