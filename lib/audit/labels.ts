import { peso } from "@/lib/plans/breakEven";
import type { AuditRow, Entity } from "./types";

export function humanize(value: string) {
  return value.replace(/[_.]/g, " ").replace(/^./, (letter) => letter.toUpperCase());
}

const entityLabels: Partial<Record<Entity, string>> = {
  car: "Vehicle", car_rate: "Vehicle rate", topup: "Top-up", contact: "Contact message",
  application: "Owner application", invoice: "Commission invoice",
};
export const entityLabel = (entity: Entity) => entityLabels[entity] ?? humanize(entity);
export function actionLabel(action: string) {
  if (action === "document.viewed") return "Document viewed";
  if (action === "audit.exported") return "Audit log exported";
  const [entity, change] = action.split(".");
  return change ? entityLabel(entity as Entity) + " " + change.replaceAll("_", " ") : humanize(action);
}

const COLUMN_LABELS: Record<string, string> = {
  is_active: "Active", payment_qr_verified: "Payment QR verified", phone: "Phone number",
  contact_phone: "Phone number", license_path: "Driver’s license", id_path: "ID document",
  proof_path: "Payment proof", orcr_path: "Vehicle registration", payment_qr_path: "Payment QR",
  car_id: "Vehicle ID", customer_id: "Customer ID", reference_no: "Transaction reference",
};
export const columnLabel = (key: string) => COLUMN_LABELS[key] ?? humanize(key);
const money = new Set(["total_price", "amount", "deposit_amount", "commission_amount", "owner_earnings",
  "commission_due", "gross_amount", "daily_rate", "overtime_per_hour", "price_php", "delivery_fee"]);
const percentages = new Set(["commission_rate", "commission_override", "deposit_percent"]);
const timeZone = "Asia/Manila";
const exact = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short", timeZone });
const dateOnly = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeZone });
const relative = new Intl.RelativeTimeFormat("en", { numeric: "auto" });

export const exactTime = (value: string) => exact.format(new Date(value));
export function relativeTime(value: string, now: number) {
  const minutes = Math.round((Date.parse(value) - now) / 60_000);
  if (!minutes) return "Just now";
  if (Math.abs(minutes) < 60) return relative.format(minutes, "minute");
  if (Math.abs(minutes) < 1440) return relative.format(Math.round(minutes / 60), "hour");
  return relative.format(Math.round(minutes / 1440), "day");
}

export function formatValue(field: string, value?: string | null, row?: AuditRow) {
  if (value == null || value === "") return "—";
  if (field === "value" && row?.entity_type === "setting" && row.entity_id) field = row.entity_id;
  if (money.has(field) && Number.isFinite(Number(value))) return peso(Number(value));
  if ((percentages.has(field) || field === "default_commission_rate") && Number.isFinite(Number(value))) {
    return new Intl.NumberFormat("en", { style: "percent", maximumFractionDigits: 2 }).format(Number(value));
  }
  if (value === "true" || value === "false") return value === "true" ? "Yes" : "No";
  if ((field.endsWith("_at") || field.endsWith("_date") || field.startsWith("period_")) && Number.isFinite(Date.parse(value))) {
    return value.length === 10 ? dateOnly.format(new Date(value)) : exactTime(value);
  }
  if (field === "status" || field.endsWith("_status") || ["fee_mode", "verification", "vehicle_type"].includes(field)) return humanize(value);
  return value;
}

export const actorName = (row: AuditRow) => row.actor_role === "system" ? "System" : row.actor_label || humanize(row.actor_role);

export function historyHref(entity: Entity, id: string) {
  return "/admin/audit-log?" + new URLSearchParams({ range: "history", entity_type: entity, entity_id: id });
}

export function recordHref(row: AuditRow) {
  const id = row.entity_id && encodeURIComponent(row.entity_id);
  if (!id) return null;
  switch (row.entity_type) {
    case "owner": case "owner_plan": return "/admin/owners/" + id;
    case "customer": return "/admin/customers#record-" + id;
    case "booking": return "/admin/bookings#record-" + id;
    case "review": return "/admin/reviews";
    case "car": return "/admin/cars#record-" + id;
    case "application": return "/admin/owner-applications#record-" + id;
    case "payment": return row.metadata.booking_id ? "/admin/bookings#record-" + encodeURIComponent(row.metadata.booking_id) : "/admin/payments";
    case "car_rate": return row.metadata.car_id ? "/admin/cars#record-" + encodeURIComponent(row.metadata.car_id) : "/admin/cars";
    case "setting": return "/admin/settings";
    case "invoice": return "/admin/commissions";
    case "topup": return "/admin/topups";
    case "plan_payment": return "/admin/plan-payments";
    default: return null;
  }
}
