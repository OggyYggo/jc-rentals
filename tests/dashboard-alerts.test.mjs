import assert from "node:assert/strict";
import { test } from "node:test";
import { friendlyError } from "../lib/alerts/errors.ts";
import { reasonError } from "../lib/alerts/reason.ts";

test("plan limits offer the owner a link to their plan", () => {
  for (const error of [{ message: "CAR_LIMIT_REACHED" }, { code: "VEHICLE_LIMIT_REACHED" }]) {
    assert.deepEqual(friendlyError(error).action, { label: "View plans", href: "/owner/plan" });
  }
});

test("maps recognized license, permission and network errors", () => {
  assert.equal(friendlyError(new Error("LICENSE_CLASS_REQUIRED")).title, "License class required");
  assert.equal(friendlyError({ code: "42501", message: "private database text" }).title, "Permission required");
  assert.equal(friendlyError("Administrator access required.").title, "Permission required");
  assert.equal(friendlyError(new TypeError("Failed to fetch")).title, "Connection problem");
});

test("displays allowlisted messages and suppresses arbitrary server details", () => {
  assert.equal(friendlyError("This application is no longer pending.").text, "This application is no longer pending.");
  assert.equal(friendlyError({ message: '<img src=x onerror="alert(1)">', details: "token" }).text, "Something went wrong. Please try again.");
});

test("validates reason lengths after trimming", () => {
  for (const reason of ["", " \n\t ", " ab ", "a".repeat(301)]) {
    assert.equal(reasonError(reason), "Please give a reason (3 to 300 characters).");
  }
  for (const reason of [" abc ", "a".repeat(300), "🚙🚗🛻"]) assert.equal(reasonError(reason), undefined);
  assert.equal(reasonError(" ", 3, 300, false), undefined);
});
