import { exactTime } from "./labels";
import type { AuditRow } from "./types";

export function csvCell(value: string | number | null) {
  const text = String(value ?? "");
  const safe = /^[\t\r\n]|^\s*[=+\-@＝＋－＠]/u.test(text) ? "'" + text : text;
  return '"' + safe.replaceAll('"', '""') + '"';
}

export function auditCsv(entries: AuditRow[]) {
  const header = ["Event ID", "When (Asia/Manila)", "Actor ID", "Actor role", "Actor", "Action",
    "Record type", "Record ID", "Record", "Summary", "Changes", "Reason", "Metadata"];
  const rows = entries.map((row) => [row.id, exactTime(row.created_at), row.actor_id,
    row.actor_role, row.actor_label, row.action, row.entity_type, row.entity_id, row.entity_label,
    row.summary, JSON.stringify(row.changes), row.reason, JSON.stringify(row.metadata)]);
  return "\uFEFF" + [header, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n");
}
