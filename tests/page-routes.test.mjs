import assert from "node:assert/strict";
import { test } from "node:test";
import { pageRoute } from "../lib/page-routes.ts";

test("tab roots have no Back destination", () => {
  for (const pathname of ["/", "/account/bookings", "/owner/bookings", "/owner/payments", "/admin/owners", "/admin/payments"]) {
    assert.equal(pageRoute(pathname), undefined);
  }
});

test("proof step points back to Pay without dropping other parameters", () => {
  const path = "/account/bookings/booking-id/pay";
  assert.deepEqual(pageRoute(path, new URLSearchParams("step=proof&from=bookings")), {
    title: "Send proof", parent: { href: path + "?from=bookings", label: "Pay" },
  });
  assert.equal(pageRoute(path).parent.href, "/account/bookings");
});

test("details have internal parents and preserve relevant navigation context", () => {
  assert.equal(pageRoute("/account/bookings/booking-id/pickup").parent.href, "/account/bookings#trip-booking-id");
  assert.equal(pageRoute("/account/bookings", new URLSearchParams("view=record")).parent.href, "/account/profile");
  assert.equal(pageRoute("/owner/credits/top-up/qr").parent.href, "/owner/credits/top-up");
  assert.equal(pageRoute("/admin/settings/credits").parent.href, "/admin/settings");
  assert.equal(pageRoute("/admin/owners/owner-id").parent.href, "/admin/owners");
  assert.equal(pageRoute("/cars/vehicle-id", new URLSearchParams("mode=self&from=2026-11-28&unrelated=1")).parent.href, "/cars?from=2026-11-28&mode=self");
});
