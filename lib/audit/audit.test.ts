import assert from "node:assert/strict";
import test from "node:test";
import { createClient } from "@supabase/supabase-js";
import { csvCell, auditCsv } from "./csv";
import { dateBounds, filterParams, orOperand, parseCursor, parseFilters, searchPattern } from "./filters";
import { actionLabel, columnLabel, exactTime, formatValue } from "./labels";
import { exportAudit, listAudit } from "./queries";

test("default date range and today use Manila midnight", () => {
  const now = new Date("2026-11-19T16:01:00Z");
  assert.deepEqual(dateBounds(parseFilters({}, now)), {
    start: "2026-11-13T16:00:00.000Z",
    end: "2026-11-20T16:00:00.000Z",
  });
  assert.equal(dateBounds(parseFilters({ range: "today" }, now)).start, "2026-11-19T16:00:00.000Z");
});

test("URL filters round-trip and invalid values are ignored", () => {
  const now = new Date("2026-11-20T04:00:00Z");
  const filters = parseFilters({
    range: "custom", from: "2026-11-16", to: "2026-11-18", entity_type: "booking",
    entity_id: "a-1", action: "booking.status_changed", reason: "1", actor: "  Ada ",
    actor_role: "bogus", q: "x".repeat(81),
  }, now);
  assert.equal(filters.actor, "Ada");
  assert.equal(filters.actor_role, undefined);
  assert.equal(filters.q, undefined);
  assert.equal(filterParams(parseFilters(Object.fromEntries(filterParams(filters)), now)).toString(), filterParams(filters).toString());
  assert.equal(parseFilters({ range: "custom", from: "2026-02-29" }, now).from, "2026-11-14");
  assert.equal(parseFilters({ range: "history", entity_id: "a-1" }, now).range, "7");
  assert.deepEqual(parseCursor({ newer: "-1", older: "51" }), { newer: undefined, older: 51 });
});

test("LIKE wildcards and PostgREST OR delimiters are escaped", () => {
  assert.equal(searchPattern("A%_B"), "%A\\%\\_B%");
  assert.equal(orOperand('%"Ada", Sr.%'), '"%\\"Ada\\", Sr.%"');
});

test("action, field, amount, percentage, boolean and time display", () => {
  assert.equal(actionLabel("booking.status_changed"), "Booking status changed");
  assert.equal(actionLabel("audit.exported"), "Audit log exported");
  assert.equal(columnLabel("payment_qr_verified"), "Payment QR verified");
  assert.equal(formatValue("commission_rate", "0.05"), "5%");
  assert.equal(formatValue("is_active", "false"), "No");
  assert.equal(formatValue("total_price", "1200.25"), "₱1,200.25");
  assert.equal(exactTime("2026-11-20T00:16:00Z"), "Nov 20, 2026, 8:16 AM");
});

test("CSV quotes cells, protects formulas and includes a UTF-8 BOM", () => {
  for (const value of ["=1+1", "+123", "-2", "@test", "  =1", "\tplain"]) {
    assert.equal(csvCell(value), `"'${value}"`);
  }
  assert.equal(csvCell('Blue, "Inc."'), '"Blue, ""Inc."""');
  assert.ok(auditCsv([]).startsWith('\uFEFF"Event ID"'));
});

function mockAuditEntries(total: number) {
  const client = createClient("https://audit.example.invalid", "fixture-key", {
    auth: { persistSession: false },
    global: {
      async fetch(input) {
        const params = new URL(String(input)).searchParams;
        const offset = params.get("id");
        const descending = params.get("order") === "id.desc";
        const limit = Number(params.get("limit"));
        const ids = Array.from({ length: total }, (_, i) => i + 1)
          .filter(id => !offset || (offset.startsWith("lt.") ? id < Number(offset.slice(3)) : id > Number(offset.slice(3))));
        if (descending) ids.reverse();
        return Response.json(ids.slice(0, limit).map(id => ({ id })));
      },
    },
  });
  return client;
}

test("keyset paging returns to the prior page and exports at most 5,000 rows", async () => {
  const db = mockAuditEntries(5201);
  const filters = parseFilters({});
  const first = await listAudit(db, filters, {});
  assert.ok(first?.older);
  assert.equal(first.entries.length, 50);
  assert.equal(first.entries[0].id, 5201);
  const older = await listAudit(db, filters, { older: first.entries.at(-1)?.id });
  assert.ok(older?.newer);
  assert.equal(older.entries[0].id, 5151);
  const newer = await listAudit(db, filters, { newer: older.entries[0].id });
  assert.deepEqual(newer?.entries, first.entries);
  const exported = await exportAudit(db, filters);
  assert.equal(exported?.length, 5000);
  assert.equal(exported.at(-1)?.id, 202);
});
