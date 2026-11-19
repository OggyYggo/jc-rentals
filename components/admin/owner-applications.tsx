"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AdminStatus } from "@/components/admin/ui";
import { approveOwnerApplication, updateOwnerApplication } from "@/app/admin/owner-applications/actions";

export type OwnerApplication = {
  id: string;
  full_name: string;
  business_name: string;
  email: string;
  phone: string;
  car_make: string;
  car_model: string;
  car_year: number | null;
  message: string;
  plate_number?: string | null;
  seats?: number | null;
  transmission?: string | null;
  offers_self_drive?: boolean;
  offers_with_driver?: boolean;
  daily_rate_self_drive?: number | null;
  daily_rate_with_driver?: number | null;
  admin_note?: string | null;
  preferred_plan?: string | null;
  status: string;
  created_at: string;
};

export function OwnerApplications({ rows }: { rows: OwnerApplication[] }) {
  const router = useRouter();
  const [busyId, setBusyId] = useState("");
  const [error, setError] = useState("");
  const [planFilter, setPlanFilter] = useState("all");
  const filteredRows = rows.filter((row) => planFilter === "all" || (planFilter === "paid" ? Boolean(row.preferred_plan && row.preferred_plan !== "starter") : (row.preferred_plan ?? "starter") === planFilter));

  async function review(row: OwnerApplication, status: "approved" | "needs_changes" | "rejected") {
    setBusyId(row.id);
    setError("");
    let result: { error?: string; ok?: boolean };
    if (status === "approved") result = await approveOwnerApplication(row.id);
    else {
      const note = window.prompt(status === "rejected" ? "Add a short rejection note for the applicant:" : "What should the applicant change?") ?? "";
      if (!note.trim()) { setBusyId(""); return; }
      result = await updateOwnerApplication(row.id, status, note);
    }
    if (result.error) setError(result.error);
    else router.refresh();
    setBusyId("");
  }

  if (!rows.length) return <p className="rounded-xl border border-[#e7ecf3] bg-white p-8 text-center text-sm text-[#718096]">No car listing applications yet.</p>;

  return <div className="space-y-4">
    <label className="flex items-center gap-3 text-sm font-medium text-[#53637a]">Filter applications<select value={planFilter} onChange={(event) => setPlanFilter(event.target.value)} className="h-10 rounded-lg border border-[#dfe6ef] bg-white px-3 text-sm"><option value="all">All plans</option><option value="paid">Wants a paid plan</option><option value="starter">Starter</option></select></label>
    {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800">{error}</p>}
    {filteredRows.map((row) => <article key={row.id} className="rounded-xl border border-[#e7ecf3] bg-white p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><h2 className="font-semibold text-[#33445b]">{row.business_name}</h2><p className="mt-1 text-sm text-[#65738a]">{row.full_name} · {row.car_year ? `${row.car_year} ` : ""}{row.car_make} {row.car_model}</p></div>
        <div className="flex items-center gap-2"><span className="rounded-full bg-[#edf4ff] px-2.5 py-1 text-xs font-semibold text-[#315fae]">Wants {(row.preferred_plan ?? "starter").replace(/^./, (letter) => letter.toUpperCase())}</span><AdminStatus status={row.status}/></div>
      </div>
      <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-sm text-[#53637a]"><a href={`mailto:${row.email}`} className="text-[#4568bd] hover:underline">{row.email}</a><a href={`tel:${row.phone}`} className="text-[#4568bd] hover:underline">{row.phone}</a></div>
      <p className="mt-3 text-xs text-[#68778c]">Plate {row.plate_number || "—"} · {row.seats || "—"} seats · {row.transmission || "Transmission not specified"}</p>
      <p className="mt-1 text-xs text-[#68778c]">{row.offers_self_drive ? `Self-drive ₱${Number(row.daily_rate_self_drive).toLocaleString()}/day` : ""}{row.offers_self_drive && row.offers_with_driver ? " · " : ""}{row.offers_with_driver ? `With driver ₱${Number(row.daily_rate_with_driver).toLocaleString()}/day` : ""}</p>
      {row.message && <p className="mt-4 whitespace-pre-wrap rounded-lg bg-[#f7f9fc] p-3 text-sm leading-6 text-[#53637a]">{row.message}</p>}
      {row.admin_note && <p className="mt-3 whitespace-pre-wrap rounded-lg bg-amber-50 p-3 text-sm text-amber-900">Review note: {row.admin_note}</p>}
      <p className="mt-3 text-xs text-[#8b97a8]">Submitted {new Date(row.created_at).toLocaleString("en-PH")}</p>
      {row.status === "pending" && <div className="mt-4 flex flex-wrap gap-2"><button disabled={busyId === row.id} onClick={() => review(row, "approved")} className="rounded-lg bg-green-700 px-3 py-2 text-sm font-medium text-white disabled:opacity-60">{busyId === row.id ? "Working…" : "Approve and invite"}</button><button disabled={busyId === row.id} onClick={() => review(row, "needs_changes")} className="rounded-lg border border-amber-200 px-3 py-2 text-sm font-medium text-amber-800 disabled:opacity-60">Request changes</button><button disabled={busyId === row.id} onClick={() => review(row, "rejected")} className="rounded-lg border border-red-200 px-3 py-2 text-sm font-medium text-red-700 disabled:opacity-60">Reject</button></div>}
    </article>)}
  </div>;
}
