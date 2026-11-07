"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AdminStatus } from "@/components/admin/ui";
import { createClient } from "@/lib/supabase/client";

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
  status: string;
  created_at: string;
};

export function OwnerApplications({ rows }: { rows: OwnerApplication[] }) {
  const router = useRouter();
  const [busyId, setBusyId] = useState("");
  const [error, setError] = useState("");

  async function review(row: OwnerApplication, status: "approved" | "rejected") {
    setBusyId(row.id);
    setError("");
    const { error: updateError } = await createClient()
      .from("owner_applications")
      .update({ status, reviewed_at: new Date().toISOString() })
      .eq("id", row.id);
    if (updateError) setError(updateError.message);
    else router.refresh();
    setBusyId("");
  }

  if (!rows.length) return <p className="rounded-xl border border-[#e7ecf3] bg-white p-8 text-center text-sm text-[#718096]">No car listing applications yet.</p>;

  return <div className="space-y-4">
    {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800">{error}</p>}
    {rows.map((row) => <article key={row.id} className="rounded-xl border border-[#e7ecf3] bg-white p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><h2 className="font-semibold text-[#33445b]">{row.business_name}</h2><p className="mt-1 text-sm text-[#65738a]">{row.full_name} · {row.car_year ? `${row.car_year} ` : ""}{row.car_make} {row.car_model}</p></div>
        <AdminStatus status={row.status}/>
      </div>
      <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-sm text-[#53637a]"><a href={`mailto:${row.email}`} className="text-[#4568bd] hover:underline">{row.email}</a><a href={`tel:${row.phone}`} className="text-[#4568bd] hover:underline">{row.phone}</a></div>
      {row.message && <p className="mt-4 whitespace-pre-wrap rounded-lg bg-[#f7f9fc] p-3 text-sm leading-6 text-[#53637a]">{row.message}</p>}
      <p className="mt-3 text-xs text-[#8b97a8]">Submitted {new Date(row.created_at).toLocaleString("en-PH")}</p>
      {row.status === "pending" && <div className="mt-4 flex gap-2"><button disabled={busyId === row.id} onClick={() => review(row, "approved")} className="rounded-lg bg-green-700 px-3 py-2 text-sm font-medium text-white disabled:opacity-60">Approve application</button><button disabled={busyId === row.id} onClick={() => review(row, "rejected")} className="rounded-lg border border-red-200 px-3 py-2 text-sm font-medium text-red-700 disabled:opacity-60">Reject</button></div>}
    </article>)}
  </div>;
}
