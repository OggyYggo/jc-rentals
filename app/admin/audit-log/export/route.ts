import { getAdminContext } from "@/lib/admin-context";
import { auditCsv } from "@/lib/audit/csv";
import { filterParams, parseFilters } from "@/lib/audit/filters";
import { exportAudit } from "@/lib/audit/queries";

export async function GET(request: Request) {
  const { supabase } = await getAdminContext();
  const filters = parseFilters(Object.fromEntries(new URL(request.url).searchParams));
  const rows = await exportAudit(supabase, filters);
  if (!rows) return new Response("Could not export the audit log.", { status: 500 });
  const { error } = await supabase.rpc("admin_log_event", {
    p_action: "audit.exported", p_entity_type: "audit", p_entity_id: null,
    p_metadata: { ...Object.fromEntries(filterParams(filters)), from: filters.from, to: filters.to },
  });
  if (error) return new Response("Could not record the audit export.", { status: 500 });
  return new Response(auditCsv(rows), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="audit-log.csv"',
      "Cache-Control": "private, no-store",
    },
  });
}
