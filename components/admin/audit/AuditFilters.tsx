import Link from "next/link";
import type { AuditFilters as Filters } from "@/lib/audit/filters";
import { actionLabel, entityLabel, humanize } from "@/lib/audit/labels";
import { entities, eventKinds, roles } from "@/lib/audit/types";

const control = "mt-1 block w-full rounded-md border border-slate-300 bg-white px-2 py-2 text-sm";

export function AuditFilters({ filters }: { filters: Filters }) {
  return <form action="/admin/audit-log" className="rounded-xl border border-slate-200 bg-white p-4">
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <label>Date range<select name="range" defaultValue={filters.range} className={control}>
        <option value="today">Today</option><option value="7">Last 7 days</option>
        <option value="30">Last 30 days</option><option value="custom">Custom</option>
        {filters.entity_id && <option value="history">Record history</option>}
      </select></label>
      <label>Custom start<input name="from" type="date" defaultValue={filters.from} className={control}/></label>
      <label>Custom end<input name="to" type="date" defaultValue={filters.to} className={control}/></label>
      <label>Actor role<select name="actor_role" defaultValue={filters.actor_role ?? ""} className={control}>
        <option value="">All roles</option>{roles.map(role => <option key={role} value={role}>{humanize(role)}</option>)}
      </select></label>
      <label>Actor name<input name="actor" maxLength={80} defaultValue={filters.actor} className={control}/></label>
      <label>Record type<select name="entity_type" defaultValue={filters.entity_type ?? ""} className={control}>
        <option value="">All records</option>{entities.map(entity => <option key={entity} value={entity}>{entityLabel(entity)}</option>)}
      </select></label>
      <label>Action<select name="action" defaultValue={filters.action ?? ""} className={control}>
        <option value="">All actions</option>
        {eventKinds.map(kind => <optgroup key={kind} label={humanize(kind)}>
          <option value={kind}>All {humanize(kind).toLowerCase()} events</option>
          {(kind === "security" ? ["document.viewed", "audit.exported"]
            : (filters.entity_type ? [filters.entity_type] : entities.filter(entity => entity !== "audit")).map(entity => entity + "." + kind))
            .map(action => <option key={action} value={action}>{actionLabel(action)}</option>)}
        </optgroup>)}
      </select></label>
      <label>Search activity<input name="q" maxLength={80} defaultValue={filters.q} className={control}/></label>
    </div>
    <div className="mt-4 flex flex-wrap items-center gap-4">
      <label className="flex items-center gap-2"><input type="checkbox" name="reason" value="1" defaultChecked={Boolean(filters.reason)}/>Has reason</label>
      {filters.entity_id && <label className="min-w-0">Record ID<input name="entity_id" defaultValue={filters.entity_id} className={control}/></label>}
      <button className="rounded-md bg-slate-900 px-4 py-2 font-medium text-white">Apply filters</button>
      <Link href="/admin/audit-log" className="text-blue-800 underline">Clear filters</Link>
    </div>
  </form>;
}
