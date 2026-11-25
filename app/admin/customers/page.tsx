import { AdminHeading } from "@/components/admin/ui";
import { CustomerManager, type AdminCustomer } from "@/components/admin/customer-manager";
import { getAdminContext } from "@/lib/admin-context";

export const instant = false;

const customerColumns = "id, full_name, phone, verification, created_at, license_path, id_path";
const licenseColumns = "id, license_declared_classes, license_classes";
const bookingColumns = "id, bookings!bookings_customer_id_fkey(count)";
const archiveColumns = "id, customer_archived_at";
const reasonColumns = "id, verification_rejection_reason";

function unavailableColumn(error: { code: string; message: string } | null) {
  return error?.code === "42501" || error?.code === "42703" || error?.code === "PGRST204";
}

export default async function AdminCustomersPage({ searchParams }: { searchParams: Promise<{ verification?: string }> }) {
  const { verification } = await searchParams;
  const initialFilter = typeof verification === "string" && ["pending", "approved", "rejected", "none"].includes(verification) ? verification : "all";
  const { supabase } = await getAdminContext();
  const loadCustomers = <Columns extends string>(columns: Columns) =>
    supabase.from("profiles").select(columns).eq("role", "customer").order("created_at", { ascending: false });

  const [result, access, selfies, bookingCounts] = await Promise.all([
    loadCustomers(`${customerColumns}, license_declared_classes, license_classes, verification_rejection_reason, customer_archived_at`),
    supabase.rpc("is_super_admin"),
    supabase.from("customer_selfies").select("customer_id,revision,status"),
    loadCustomers(bookingColumns),
  ]);
  let customers: AdminCustomer[] = result.data ?? [];
  let canReject = true;
  let canReviewClasses = true;
  let archiveAvailable = true;
  let error = result.error;

  if (unavailableColumn(error)) {
    const [base, licenses, reasons, archives] = await Promise.all([
      loadCustomers(customerColumns), loadCustomers(licenseColumns), loadCustomers(reasonColumns), loadCustomers(archiveColumns),
    ]);
    canReviewClasses = !licenses.error;
    canReject = !reasons.error;
    archiveAvailable = !archives.error;
    error = base.error
      ?? (unavailableColumn(licenses.error) ? null : licenses.error)
      ?? (unavailableColumn(reasons.error) ? null : reasons.error)
      ?? (unavailableColumn(archives.error) ? null : archives.error);

    const licensesById = new Map(licenses.data?.map((row) => [row.id, row]));
    const reasonsById = new Map(reasons.data?.map((row) => [row.id, row.verification_rejection_reason]));
    const archivesById = new Map(archives.data?.map((row) => [row.id, row.customer_archived_at]));
    customers = (base.data ?? []).map((customer) => ({
      ...customer,
      license_declared_classes: licensesById.get(customer.id)?.license_declared_classes ?? [],
      license_classes: licensesById.get(customer.id)?.license_classes ?? [],
      verification_rejection_reason: reasonsById.get(customer.id) ?? null,
      customer_archived_at: archivesById.get(customer.id) ?? null,
    }));
  }

  const selfiesByCustomer = new Map(selfies.data?.map(row => [row.customer_id, { revision: row.revision, status: row.status }]));
  const bookingsByCustomer = new Map(bookingCounts.data?.map(row => [row.id, row.bookings[0]?.count ?? 0]));
  customers = customers.map(customer => ({ ...customer, selfie: selfiesByCustomer.get(customer.id), bookingCount: bookingsByCustomer.get(customer.id) }));

  return <>
    <AdminHeading eyebrow="People" title="Customers" description="Review customer records and privately inspect submitted verification documents." />
    {error ? <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-900">
      Could not load customer records. Reload this page to try again.
      {/^(?:[0-9A-Z]{5}|PGRST\d{3})$/.test(error.code) && <> Database error code {error.code}.</>}
    </p> : <>
      {(!canReviewClasses || !canReject || (access.data === true && !archiveAvailable)) && <p role="status" className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
        {!canReviewClasses && <>License class review requires database migrations through 202611190006. </>}
        {!canReject && <>Rejection requires database migration 202611190004. </>}
        {access.data === true && !archiveAvailable && <>Customer archiving requires database migration 202611190007.</>}
      </p>}
      <CustomerManager key={initialFilter} initialFilter={initialFilter} customers={customers} canReject={canReject} canReviewClasses={canReviewClasses} archiveAvailable={archiveAvailable} canArchive={archiveAvailable && access.data === true} />
    </>}
  </>;
}
