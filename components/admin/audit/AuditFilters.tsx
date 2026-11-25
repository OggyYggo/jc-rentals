import Link from "next/link";
import { filterParams, type AuditFilters as Filters } from "@/lib/audit/filters";
import { actionLabel, entityLabel, humanize } from "@/lib/audit/labels";
import { entities, eventKinds, roles } from "@/lib/audit/types";

import { mobileAction } from "@/components/admin/ui";

const control = "mt-1 block w-full rounded-md border border-slate-300 bg-white px-2 py-2 text-sm";

export function AuditFilters({ filters }: { filters: Filters }) {
  const categories = [
    { label: "All", entity: undefined, action: undefined },
    { label: "Payments", entity: "payment", action: undefined },
    { label: "Security", entity: undefined, action: "security" },
    { label: "Settings", entity: "setting", action: undefined },
    { label: "Documents", entity: undefined, action: "document.viewed" },
  ];
  return <>
    <nav aria-label="Audit categories" className="mb-3 flex gap-2 overflow-x-auto p-1 lg:hidden">
      {categories.map(category => {
        const query = filterParams({ ...filters, entity_id: undefined, entity_type: undefined, action: undefined, range: filters.range === "history" ? "7" : filters.range });
        if (category.entity) query.set("entity_type", category.entity);
        if (category.action) query.set("action", category.action);
        return <Link key={category.label} href={`/admin/audit-log?${query}`} aria-current={filters.entity_type === category.entity && filters.action === category.action ? "page" : undefined} className={`${mobileAction} shrink-0 bg-white aria-[current=page]:bg-[#EAF4FF]`}>{category.label}</Link>;
      })}
    </nav>
    <form action="/admin/audit-log" className="rounded-xl border border-slate-200 bg-white p-4">
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
      <label className="max-lg:-order-1">Search activity<input name="q" maxLength={80} defaultValue={filters.q} className={control}/></label>
    </div>
    <div className="mt-4 flex flex-wrap items-center gap-4">
      <label className="flex items-center gap-2"><input type="checkbox" name="reason" value="1" defaultChecked={Boolean(filters.reason)}/>Has reason</label>
      {filters.entity_id && <label className="min-w-0">Record ID<input name="entity_id" defaultValue={filters.entity_id} className={control}/></label>}
      <button className="rounded-md bg-slate-900 px-4 py-2 font-medium text-white">Apply filters</button>
      <Link href="/admin/audit-log" className="text-blue-800 underline">Clear filters</Link>
    </div>
  </form></>;
}
