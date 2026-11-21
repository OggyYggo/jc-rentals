export const commissionBookingFilter = "status.in.(confirmed,picked_up,returned,completed),and(status.eq.cancelled,cancel_fee_amount.gt.0)";

type BookingRevenue = { status: string; cancel_fee_amount: number; total_price: number };

export function hasKeptFee(booking: BookingRevenue) {
  return booking.status === "cancelled" && Number(booking.cancel_fee_amount) > 0;
}

export function earnsCommission(booking: BookingRevenue) {
  return hasKeptFee(booking) || ["confirmed", "picked_up", "returned", "completed"].includes(booking.status);
}

export function bookingRevenue(booking: BookingRevenue) {
  return Number(hasKeptFee(booking) ? booking.cancel_fee_amount : booking.total_price);
}

export function manilaMonth(date: Date) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila", year: "numeric", month: "2-digit" }).format(date);
}
