import { z } from "zod";
import { entities, eventKinds, roles, type SearchParams } from "./types";

const day = 86_400_000;
const date = z.iso.date().refine(value => value >= "0001-01-01" && value <= "9998-12-31");
const text = z.string().trim().max(80);
export const recordId = z.string().regex(/^[a-zA-Z0-9_-]{1,80}$/);
const cursor = z.string().regex(/^[1-9][0-9]{0,15}$/).transform(Number).refine(Number.isSafeInteger);
const schema = z.object({
  range: z.enum(["today", "7", "30", "custom", "history"]).catch("7"),
  from: date.optional().catch(undefined),
  to: date.optional().catch(undefined),
  actor_role: z.enum(roles).optional().catch(undefined),
  actor: text.optional().catch(undefined),
  entity_type: z.enum(entities).optional().catch(undefined),
  entity_id: recordId.optional().catch(undefined),
  action: z.string().refine((action) => {
    const [entity, kind] = action.split(".");
    return eventKinds.some(value => value === action)
      || action === "document.viewed" || action === "audit.exported"
      || entities.some(value => value === entity) && eventKinds.some(value => value === kind && value !== "security") && action === entity + "." + kind;
  }).optional().catch(undefined),
  q: text.optional().catch(undefined),
  reason: z.literal("1").optional().catch(undefined),
});
export type AuditFilters = z.infer<typeof schema> & { from: string; to: string };

export function parseFilters(params: SearchParams, now = new Date()): AuditFilters {
  const filters = schema.parse(params);
  const today = new Date(now.getTime() + 8 * 3_600_000).toISOString().slice(0, 10);
  const prior = (days: number) => new Date(Date.parse(today) - days * day).toISOString().slice(0, 10);
  if (!filters.entity_type) filters.entity_id = undefined;
  if (filters.range === "history" && !filters.entity_id) filters.range = "7";
  if (filters.range === "custom") {
    filters.to ??= today;
    filters.from ??= prior(6);
    if (filters.from > filters.to) {
      filters.from = prior(6);
      filters.to = today;
    }
  } else {
    filters.to = today;
    filters.from = prior(filters.range === "today" ? 0 : filters.range === "30" ? 29 : filters.range === "history" ? 731 : 6);
  }
  return { ...filters, from: filters.from, to: filters.to };
}

export function parseCursor(params: SearchParams) {
  return { newer: cursor.safeParse(params.newer).data, older: cursor.safeParse(params.older).data };
}

export function filterParams(filters: AuditFilters) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value && ((key !== "from" && key !== "to") || filters.range === "custom")) params.set(key, value);
  }
  return params;
}

export function dateBounds(filters: AuditFilters) {
  const start = new Date(filters.from + "T00:00:00+08:00").toISOString();
  const end = new Date(Date.parse(filters.to + "T00:00:00+08:00") + day).toISOString();
  return { start, end };
}

// PostgREST's OR syntax needs quoted operands and escapes in addition to SQL LIKE escapes.
export function searchPattern(value: string) {
  return "%" + value.replace(/[\\%_*]/g, "\\$&") + "%";
}

export function orOperand(pattern: string) {
  return '"' + pattern.replace(/[\\"]/g, "\\$&") + '"';
}
