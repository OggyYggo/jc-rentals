const timeZone = "Asia/Manila";
const date = new Intl.DateTimeFormat("en-US", { timeZone, month: "short", day: "numeric" });
const time = new Intl.DateTimeFormat("en-US", { timeZone, hour: "numeric", minute: "2-digit" });
const month = new Intl.DateTimeFormat("en-US", { timeZone, month: "long", year: "numeric" });
const day = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" });

export function creditDate(value: string, withTime = false) {
  const timestamp = new Date(value);
  return withTime ? `${date.format(timestamp)}, ${time.format(timestamp)}` : date.format(timestamp);
}

export function creditMonth(value: string) {
  return month.format(new Date(value));
}

export function manilaDay(value: Date) {
  return day.format(value);
}

export function channelLabel(method: string | null) {
  switch (method?.toLowerCase()) {
    case "gcash": return "GCash";
    case "maya": return "Maya";
    case "gotyme": return "GoTyme";
    default: return "QR Ph or bank";
  }
}

export type CreditActivityRow = {
  id: string;
  type: string;
  amount: number;
  status: string;
  note: string | null;
  created_at: string;
  booking?: { reference: string; car: { brand: string; model: string } | null } | null;
  online?: { method: string | null };
};

export type TopUpResult = {
  orderId: string;
  status: string;
  amount: number;
  method: string | null;
};

export type Invoice = {
  id: string;
  period_month: string;
  commission_due: number;
  due_date: string | null;
  status: string;
  total_bookings: number;
  gross_amount: number;
  paid_at: string | null;
};
