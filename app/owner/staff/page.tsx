import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { getOwnerContext } from "@/lib/owner-context";
import { ownerStaffFields, type OwnerStaffRow } from "@/lib/staff/context";
import { staffAbilities, staffRestrictions } from "@/lib/staff/content";
import { InviteStaff } from "@/components/staff/owner-controls";
import { StaffChip, StaffRules, staffCard } from "@/components/staff/shared";
import { StaffLoadError } from "@/components/staff/load-error";
import { paymentDate } from "@/lib/payment-format";

export const instant = false;

export default async function OwnerStaffPage() {
  const { supabase, owner } = await getOwnerContext();
  const [staff, limit] = await Promise.all([
    supabase.from("owner_staff").select(ownerStaffFields).eq("owner_id",owner.id)
      .neq("status","removed").order("created_at").returns<OwnerStaffRow[]>(),
    supabase.rpc("owner_staff_limit"),
  ]);
  const rows = staff.data ?? [];
  const max = typeof limit.data === "number" ? limit.data : null;
  const full = max !== null && rows.length >= max;
  return <div className="mx-auto max-w-4xl space-y-4 font-body text-[#0F2342]">
    <header className="flex flex-wrap items-start justify-between gap-3">
      <div><h1 className="font-heading text-2xl font-bold">Handover staff</h1>
        <p className="mt-1 text-sm text-[#5B6F89]">People who can scan and hand over vehicles for you.</p></div>
      <InviteStaff disabled={Boolean(staff.error || limit.error || max === null || full)} />
    </header>
    {staff.error || limit.error || max === null ? <StaffLoadError message="Could not load handover staff." /> : <section className={staffCard}>
      <p className="text-[#5B6F89]">{rows.length} of {max} staff used.{full && " Remove someone to invite another."}</p>
      {!rows.length ? <p className="mt-3">No staff yet. Invite someone you trust to hand over vehicles when you are away.</p>
        : <ul className="mt-2 divide-y divide-[#E3EEF9]">{rows.map(row => <li key={row.id}>
          <Link href={`/owner/staff/${row.id}`} className="flex min-h-14 flex-wrap items-center gap-2 rounded-lg py-2 focus-visible:outline-2 focus-visible:outline-[#0A47B1]">
            <span aria-hidden className="grid size-10 shrink-0 place-items-center rounded-full bg-[#EAF4FF] font-bold text-[#0A47B1]">
              {row.display_name.split(/\s+/).slice(0,2).map(part => Array.from(part)[0]).join("").toUpperCase()}
            </span>
            <span className="min-w-0 flex-1 basis-32"><span className="block break-words font-semibold">{row.display_name}</span>
              <span className="block break-words text-[13px] text-[#5B6F89]">
                {row.last_handover_at ? `Last handover ${paymentDate(row.last_handover_at)}`
                  : row.status === "invited" ? `Invited ${paymentDate(row.invited_at)}` : "No handovers yet"}
              </span></span>
            <StaffChip status={row.status} /><ChevronRight size={16} aria-hidden className="shrink-0 text-[#0A47B1]" />
          </Link>
        </li>)}</ul>}
    </section>}
    <div className="grid gap-3 md:grid-cols-2">
      <section className={`${staffCard} space-y-2`}><h2 className="font-heading font-bold">Staff can</h2><StaffRules items={staffAbilities} /></section>
      <section className={`${staffCard} space-y-2`}><h2 className="font-heading font-bold">Staff cannot see</h2><StaffRules items={staffRestrictions} restricted /></section>
    </div>
  </div>;
}
