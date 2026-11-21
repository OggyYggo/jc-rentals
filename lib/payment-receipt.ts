export type Receipt = {
  id: string;
  receipt_no: string;
  public_code: string;
  status: "valid" | "voided" | "refunded";
  created_at: string;
  details: {
    booking_reference: string; owner_name: string; customer_name: string; vehicle: string;
    start_date: string; end_date: string; mode: string; pickup: string | null;
    amount: number; balance: number; safety_deposit: number | null; channel: string;
  };
};

export const confirmationFooter = "This is a payment confirmation for your booking, not an official tax receipt.";

export const receiptStatuses = { valid: "Valid", voided: "Voided", refunded: "Refunded" };
