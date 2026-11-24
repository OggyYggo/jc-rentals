type Provider = { label: string; color: string; letter: string; appLink?: string };

export type PaymentProvider = "gcash" | "maya" | "gotyme" | "bpi" | "maribank" | "other_qrph";

export const paymentProviders: Record<PaymentProvider, Provider> = {
  gcash: { label: "GCash", color: "#0065DC", letter: "G" },
  maya: { label: "Maya", color: "#156845", letter: "M" },
  gotyme: { label: "GoTyme", color: "#006979", letter: "G" },
  bpi: { label: "BPI", color: "#A91530", letter: "B" },
  maribank: { label: "MariBank", color: "#A94315", letter: "M" },
  other_qrph: { label: "QR Ph", color: "#465A76", letter: "QR" },
};

export type PaymentOption = {
  id: string;
  provider: PaymentProvider;
  label: string;
  account_name: string;
  account_hint: string | null;
  is_preferred: boolean;
  sort_order: number;
  qr_path: string;
  qr_bucket: "owner-qr" | "owner-applications";
};

export type ManagedPaymentOption = PaymentOption & {
  verified: boolean;
  rejection_reason: string | null;
  updated_at: string;
};

export type BookingPaymentOption = Omit<PaymentOption, "qr_path" | "qr_bucket"> & { qrUrl: string | null };
