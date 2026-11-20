import { ExportAudit } from "@/components/admin/audit/ExportAudit";
import Link from "next/link";
import { AdminHeading } from "@/components/admin/ui";
import { AuditFilters } from "@/components/admin/audit/AuditFilters";
import { AuditTable } from "@/components/admin/audit/AuditTable";
import { getAdminContext } from "@/lib/admin-context";
import { filterParams, parseCursor, parseFilters } from "@/lib/audit/filters";
import { listAudit } from "@/lib/audit/queries";
import type { SearchParams } from "@/lib/audit/types";

export const instant = false;

export default async function AdminAuditLogPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const { supabase } = await getAdminContext();
  const params = await searchParams;
  const now = new Date();
  const filters = parseFilters(params, now);
  const result = await listAudit(supabase, filters, parseCursor(params));
  const query = filterParams(filters);

  function pageHref(direction: "newer" | "older", id: number) {
    const next = new URLSearchParams(query);
    next.set(direction, String(id));
    return "/admin/audit-log?" + next;
  }

  return <>
    <AdminHeading eyebrow="Settings" title="Audit log" description="Review changes and security activity. All times are shown in Asia/Manila."/>
    <div className="space-y-4 text-sm">
      <AuditFilters key={query.toString()} filters={filters}/>
      <div className="flex justify-end">
        <ExportAudit href={`/admin/audit-log/export?${query}`}/>
      </div>
      {!result ? <p role="alert" className="rounded-lg border bg-white p-4">Could not load the audit log. <Link className="underline" href={`/admin/audit-log?${query}`}>Try again</Link>.</p>
        : !result.entries.length ? <p className="rounded-lg border bg-white p-4">No activity for these filters. <Link className="underline" href="/admin/audit-log">Clear filters</Link></p>
        : <><div className="lg:rounded-lg lg:border lg:border-slate-200 lg:bg-white"><AuditTable rows={result.entries} now={now.getTime()}/></div>
          <nav aria-label="Audit log pages" className="flex justify-between gap-3">
            <span>{result.newer && <Link className="text-blue-800 underline" href={pageHref("newer", result.entries[0].id)}>Newer</Link>}</span>
            {result.older && <Link className="text-blue-800 underline" href={pageHref("older", result.entries.at(-1)!.id)}>Older</Link>}
          </nav></>}
    </div>
  </>;
}
