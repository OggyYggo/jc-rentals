export default function AuditLogLoading() {
  return <div role="status" aria-busy="true" className="space-y-4">
    <h1 className="text-xl font-semibold">Audit log</h1>
    <span className="sr-only">Loading audit log</span>
    <div className="h-32 animate-pulse rounded-xl bg-slate-100"/>
    {Array.from({ length: 6 }, (_, i) => <div key={i} className="h-14 animate-pulse rounded-lg bg-slate-100"/>)}
  </div>;
}
