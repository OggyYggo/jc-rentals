import assert from "node:assert/strict";
import test from "node:test";
import { hasSetupVehicle, hasStartingCredits, qrChecklistState } from "../lib/onboarding/checklist.ts";
import { readStorage, writeStorage } from "../lib/onboarding/storage.ts";

test("uses active verified payment options and supports legacy QR records", () => {
  const pending = { qr_path: "test", verified: false, rejection_reason: null };
  assert.equal(qrChecklistState([], { payment_qr_path: null, payment_qr_verified: false }), "todo");
  assert.equal(qrChecklistState([pending], null), "review");
  assert.equal(qrChecklistState([{ ...pending, rejection_reason: "Rejected" }], null), "todo");
  assert.equal(qrChecklistState([pending, { ...pending, verified: true }], null), "done");
  assert.equal(qrChecklistState([], { payment_qr_path: "legacy", payment_qr_verified: true }), "done");
  assert.equal(qrChecklistState([], null), null);
});

test("completing vehicle setup requires three photos and a rate, with listing visibility checked separately", () => {
  const car = { is_active: true, car_photos: [1, 2], car_rates: [{ daily_rate: 1000 }] };
  assert.equal(hasSetupVehicle([car]), false);
  car.car_photos.push(3);
  assert.equal(hasSetupVehicle([car]), true);
  assert.equal(hasSetupVehicle([{ ...car, car_rates: [] }]), false);
  assert.equal(hasSetupVehicle([{ ...car, is_active: false }]), true);
  assert.equal(hasSetupVehicle([{ ...car, is_active: false }], true), false);
});

test("starting credits track the configured minimum and invoice owners skip top-up", () => {
  assert.equal(hasStartingCredits(false, 499, 500), false);
  assert.equal(hasStartingCredits(false, 500, 500), true);
  assert.equal(hasStartingCredits(false, 500, 600), false);
  assert.equal(hasStartingCredits(false, null, 500), null);
  assert.equal(hasStartingCredits(true, null, null), true);
});

test("onboarding works when browser storage access throws", () => {
  globalThis.window = {
    get localStorage() { throw new Error("blocked"); },
    get sessionStorage() { throw new Error("blocked"); },
  };
  try {
    for (const session of [false, true]) {
      assert.equal(readStorage("tip", session), null);
      assert.equal(writeStorage("tip", "1", session), false);
    }
  } finally {
    delete globalThis.window;
  }
});
