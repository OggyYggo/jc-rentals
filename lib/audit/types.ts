export const entities = [
  "owner", "customer", "booking", "car", "application", "payment", "topup", "invoice",
  "setting", "promo", "car_rate", "driver", "pickup_location", "plan", "owner_plan",
  "plan_payment", "contact", "audit", "review",
] as const;

export const roles = ["admin", "owner", "customer", "system"] as const;
export const eventKinds = ["created", "updated", "status_changed", "deleted", "security"] as const;
export type Entity = typeof entities[number];

export type AuditChange = { from?: string | null; to?: string | null; masked?: true };
export type AuditRow = {
  id: number;
  created_at: string;
  actor_id: string | null;
  actor_role: typeof roles[number];
  actor_label: string | null;
  action: string;
  entity_type: Entity;
  entity_id: string | null;
  entity_label: string | null;
  summary: string;
  changes: Record<string, AuditChange>;
  reason: string | null;
  metadata: Record<string, string | null>;
};

export type SearchParams = Record<string, string | string[] | undefined>;
