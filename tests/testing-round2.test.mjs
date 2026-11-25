import assert from "node:assert/strict";
import { test } from "node:test";
import { validatePassword } from "../lib/auth/password-policy.ts";
import { addCalendarDays, calendarDayKey, localCalendarDate, nextFreeRange, overlapsAvailability } from "../lib/cars/availability.ts";
import { readAvailability } from "../lib/cars/read-availability.ts";

test("new passwords reject missing requirements, weak patterns and personal data", () => {
  for (const [password, rule] of [
    ["Abcdef1!", "length"], ["abcdefghij1!", "uppercase"], ["ABCDEFGHIJ1!", "lowercase"],
    ["Abcdefghij!!", "number"], ["Abcdefghij12", "symbol"], ["Mango-Tricycle-48! ", "spaces"],
    ["Password123!", "common"], ["Kuyogbohol123!", "common"], ["Qwerty123!", "common"],
    ["Scooter-Aaaaaaaa-4!", "common"], ["Mango-12345-Trip!", "common"],
    ["Mango-Tricycle-48!" + "\u{1F34B}".repeat(15), "length"],
  ]) assert.ok(validatePassword(password).includes(rule), rule);

  assert.deepEqual(validatePassword("Mango-Tricycle-48!"), []);
  assert.ok(validatePassword("Mango-Tricycle-48!", { email: "mango@example.invalid" }).includes("personal"));
  assert.ok(validatePassword("Mango-Tricycle-48!", { fullName: "Alma Mango" }).includes("personal"));
});

test("calendar date keys round-trip locally and overlap includes the return day", () => {
  const periods = [{ start: "2026-11-28", end: "2026-11-30", kind: "booked" }];
  for (let i = 0; i < 3; i++) {
    const day = addCalendarDays("2026-11-28", i);
    assert.equal(day, `2026-11-${28 + i}`);
    assert.equal(calendarDayKey(localCalendarDate(day)), day);
    assert.ok(overlapsAvailability(day, day, periods));
  }
  assert.ok(overlapsAvailability("2026-11-27", "2026-11-28", periods));
  assert.ok(overlapsAvailability("2026-11-30", "2026-12-03", periods));
  assert.ok(!overlapsAvailability("2026-12-01", "2026-12-03", periods));
});

test("the next free range keeps the same duration and avoids every inclusive hold", () => {
  const periods = [
    { start: "2026-11-28", end: "2026-11-30", kind: "held" },
    { start: "2026-12-03", end: "2026-12-03", kind: "blocked" },
  ];
  assert.deepEqual(nextFreeRange("2026-11-28", "2026-11-30", "2026-12-08", periods), {
    start: "2026-12-04", end: "2026-12-06",
  });
  assert.equal(nextFreeRange("2026-11-28", "2026-11-30", "2026-12-05", periods), null);
});

test("a returned availability query error fails closed and logs no private query data", async t => {
  const log = t.mock.method(console, "error", () => {});
  const db = {
    from(view) {
      return {
        select() { return this; },
        eq() { return this; },
        lte() { return this; },
        gte() { return this; },
        async overrideTypes() {
          return view === "public_car_booking_dates"
            ? { data: null, error: { message: "Internal database details" } }
            : { data: [], error: null };
        },
      };
    },
  };
  assert.equal(await readAvailability(db, "test-car", "2026-11-28", "2026-11-30"), null);
  assert.deepEqual(log.mock.calls[0].arguments, [
    "Could not load vehicle availability", { blocks: false, bookings: true },
  ]);
});
