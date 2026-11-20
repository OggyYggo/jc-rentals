import { createClient } from "@/lib/supabase/server";
import { dateBounds, orOperand, searchPattern, type AuditFilters } from "./filters";
import type { AuditRow, Entity } from "./types";

type Database = Awaited<ReturnType<typeof createClient>>;
export const auditPageSize = 50;
export const auditExportLimit = 5000;

function entityClause(entity: Entity, id: string) {
  const own = `and(entity_type.eq.${entity},entity_id.eq.${id})`;
  if (entity === "booking") return `${own},and(entity_type.eq.payment,metadata->>booking_id.eq.${id})`;
  if (entity === "car") return `${own},and(entity_type.in.(car_rate,review),metadata->>car_id.eq.${id})`;
  if (entity === "owner") return `${own},metadata->>owner_id.eq.${id}`;
  return own;
}

function filteredAudit(db: Database, filters: AuditFilters) {
  const { start, end } = dateBounds(filters);
  let query = db.from("audit_log").select("*").gte("created_at", start).lt("created_at", end);
  if (filters.actor_role) query = query.eq("actor_role", filters.actor_role);
  if (filters.actor) query = query.ilike("actor_label", searchPattern(filters.actor));
  if (filters.entity_type && filters.entity_id) query = query.or(entityClause(filters.entity_type, filters.entity_id));
  else if (filters.entity_type) query = query.eq("entity_type", filters.entity_type);
  if (filters.action === "security") query = query.in("action", ["document.viewed", "audit.exported"]);
  else if (filters.action?.includes(".")) query = query.eq("action", filters.action);
  else if (filters.action) query = query.like("action", "%." + filters.action.replaceAll("_", "\\_"));
  if (filters.reason) query = query.not("reason", "is", null);
  if (filters.q) {
    const needle = orOperand(searchPattern(filters.q));
    query = query.or(`summary.ilike.${needle},entity_label.ilike.${needle}`);
  }
  return query;
}

export async function listAudit(db: Database, filters: AuditFilters, cursor: { older?: number; newer?: number }) {
  let query = filteredAudit(db, filters);
  if (cursor.newer) query = query.gt("id", cursor.newer);
  else if (cursor.older) query = query.lt("id", cursor.older);

  const { data, error } = await query.order("id", { ascending: Boolean(cursor.newer) }).limit(auditPageSize + 1);
  if (error) return null;
  const entries = (data as AuditRow[]).slice(0, auditPageSize);
  if (cursor.newer) entries.reverse();
  return {
    entries,
    newer: cursor.newer ? data.length > auditPageSize : Boolean(cursor.older),
    older: cursor.newer ? true : data.length > auditPageSize,
  };
}

export async function exportAudit(db: Database, filters: AuditFilters) {
  const rows: AuditRow[] = [];
  let cursor: number | undefined;
  while (rows.length < auditExportLimit) {
    let query = filteredAudit(db, filters);
    if (cursor) query = query.lt("id", cursor);
    const { data, error } = await query.order("id", { ascending: false }).limit(Math.min(500, auditExportLimit - rows.length));
    if (error) return null;
    if (!data.length) break;
    rows.push(...data as AuditRow[]);
    cursor = rows.at(-1)?.id;
  }
  return rows;
}

export async function entityHistory(db: Database, entity: Entity, id: string) {
  const { data, error } = await db.from("audit_log").select("*").or(entityClause(entity, id))
    .order("id", { ascending: false }).limit(20);
  return error ? null : data as AuditRow[];
}

export async function recentActivity(db: Database) {
  const { data, error } = await db.from("audit_log").select("*").order("id", { ascending: false }).limit(8);
  return error ? null : data as AuditRow[];
}
