import assert from "node:assert/strict";
import { test } from "node:test";
import { bookingRevenue, earnsCommission } from "../lib/booking-revenue.ts";

test("paid rental lifecycle statuses use the full rental value for commission", () => {
  for (const status of ["confirmed", "picked_up", "returned", "completed"]) {
    const booking = { status, total_price: 2400, cancel_fee_amount: 0 };
    assert.equal(earnsCommission(booking), true);
    assert.equal(bookingRevenue(booking), 2400);
  }
});

test("late cancellation uses the retained fee for commission", () => {
  const booking = { status: "cancelled", total_price: 2400, cancel_fee_amount: 360 };
  assert.equal(earnsCommission(booking), true);
  assert.equal(bookingRevenue(booking), 360);
});

test("unpaid, expired and fully refunded bookings earn no commission", () => {
  for (const status of ["pending", "awaiting_payment", "payment_review", "expired", "rejected", "cancelled"]) {
    assert.equal(earnsCommission({ status, total_price: 2400, cancel_fee_amount: 0 }), false);
  }
});
