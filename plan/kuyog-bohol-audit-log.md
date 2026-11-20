# Kuyog Bohol — Admin Audit Log and History (Implementation Spec for Codex)

**Repo:** `OggyYggo/jc-rentals` (Next.js 16 App Router, React 19, TypeScript, Tailwind 4, shadcn/base-ui, Supabase Postgres + RLS).
**Goal:** the admin can see **who did what, to which record, when, what changed (from → to) and why**. It works for admin actions, owner actions on money and publishing, customer actions on bookings, and automatic system jobs. It is **append-only** and cannot be edited from the app.
**Pages:** a new `/admin/audit-log` page, a **History** panel on record pages (owner, customer, booking, vehicle, application), and a **Recent activity** card on the admin overview.
**Related specs:** `kuyog-bohol-security-audit-verified.md`, `kuyog-bohol-pricing-and-plans.md`, `kuyog-bohol-sweetalert.md`, `kuyog-bohol-user-onboarding.md`.

---

## 0. What exists today (and the gap)

- **No audit log.** Only partial traces: `reviewed_by` / `reviewed_at` columns on `owner_applications`, `owner_credit_ledger` and some other tables, `updated_by` on `settings`, and notifications (which are messages, not history).
- Several admin actions are done through **definer functions**: `admin_set_customer_verification`, `admin_create_owner`, `admin_review_owner_topup`, `admin_set_owner_payment_terms`, `admin_set_owner_payment_qr_verified`, `admin_generate_monthly_invoices`, `admin_mark_invoice_paid`, plus `confirm_booking_payment`, `reject_booking_payment`, `cancel_booking`, `mark_deposit_refunded`, `owner_set_booking_status`, `owner_mark_payment_received`.
- Other admin actions are **direct table writes** from admin components (for example `components/admin/owner-manager.tsx` updating `owners`, `car-manager.tsx` updating `cars`, `platform-settings-form.tsx` updating `settings`). A history that depends on each screen remembering to log would miss things.
- Automatic jobs (pg_cron expiring bookings, the notification dispatch webhook) change data with no signed-in user.
- Tables (from the migrations): `profiles`, `cars`, `bookings`, `owners`, `car_rates`, `car_photos`, `car_blocked_dates`, `payments`, `settings`, `drivers`, `promo_codes`, `pickup_locations`, `reviews`, `commission_invoices`, `promo_clicks`, `owner_credit_ledger`, `owner_applications`, `notifications`, `notification_preferences`, `push_subscriptions`.

**Design decision:** record changes **in the database with triggers**, so no code path (admin UI, owner UI, RPC, cron, service role) can skip it, and add a few **explicit events** for things that are not row changes (viewing a customer's documents, exporting the log).

## 1. Principles

1. **Capture in the database,** in the same transaction as the change. If the change rolls back, the log row rolls back too.
2. **Append-only.** No updates, deletes or truncates, not even by admins or the service role (enforced by triggers).
3. **Readable by admins only.**
4. **Minimal sensitive data.** Never store passwords, tokens, signed URLs, full ID or license numbers, bank or GCash numbers, QR image paths or document paths. Store *that* something changed, not the secret value (section 3.3).
5. **Human first.** Every row has a plain-English summary (*Commission rate changed 5% → 3% for Reyes Rentals*), plus the structured diff.
6. **Cheap.** Log only meaningful columns, skip no-op updates, keep rows small.
7. **Fail closed.** If the audit insert fails, the business change fails. The audit write is a simple insert so this should not happen in practice. Do not swallow audit errors.

## 2. What is logged

### 2.1 Tracked tables (row changes via trigger)

| Table | Operations | Tracked columns (verify real names in the migrations) | Masked columns | Label |
|---|---|---|---|---|
| `owners` | insert, update, delete | `business_name, commission_rate, fee_mode, deposit_percent, is_active, payment_qr_verified, payment_method_label, payment_account_name` | `contact_phone, payment_qr_path` | `business_name` |
| `profiles` | update | `role, verification, full_name` (+ `license_classes` when motorcycles exist) | `phone, license_path, id_path` (log as *changed*) | `full_name` |
| `owner_applications` | insert, update | `status, reviewed_by, review_note`/reason column if present | personal fields, file paths | `business_name` or `full_name` |
| `cars` | insert, update, delete | `is_active, brand, model, year, plate_number, allows_self_drive, allows_with_driver, owner_id` (+ `vehicle_type`, `plan_hidden`) | | `brand model plate_number` |
| `car_rates` | insert, update, delete | `daily_rate, deposit_amount, license_required, included_hours, overtime_per_hour` | | car label + mode |
| `bookings` | insert, update | `status, total_price, commission_amount, owner_earnings, deposit_amount, deposit_refund_status, start_date, end_date, car_id, customer_id` | | `reference` |
| `payments` | insert, update | `status, amount, method, reference_no` | `proof_path` | booking reference |
| `owner_credit_ledger` | insert, update | `status, amount, type, reviewed_by, reject_reason/note` | `proof_path` | owner name |
| `commission_invoices` | insert, update | `status, total/amount, period, paid_at` | | invoice number or period |
| `settings` | insert, update | the value column(s) and key | | the setting key |
| `promo_codes` | insert, update, delete | `code, is_active, discount fields, expires_at` | | `code` |
| `drivers` | insert, update, delete | `is_active, full_name` | `phone` | `full_name` |
| `pickup_locations` | insert, update, delete | all non-sensitive | | name |
| Plans (when built): `plans`, `owner_plans`, `plan_payments` | all | price, limits, commission, status, expiry, overrides | `proof_path` | plan or owner name |
| Contact (when built): `contact_messages` | update | `status, admin_note` | `email, mobile, message` | topic |

**Not tracked** (noise or private): `notifications`, `notification_preferences`, `push_subscriptions`, `promo_clicks`, `owner_application_rate_limits`, `car_photos` views, `reviews` text, storage object contents.

### 2.2 Explicit events (written by a guarded function)

| Action key | When |
|---|---|
| `document.viewed` | an admin opens a customer's license or ID, or an owner application document (log **who viewed whose document**, not the file) |
| `audit.exported` | an admin exports the audit log (with the filters used) |
| `admin.login_notice` (optional) | skip in v1; Supabase Auth already keeps auth logs |

### 2.3 System actors
When `auth.uid()` is null (pg_cron, webhook, service role), the actor is **System** with a label such as `cron:expire_unpaid_bookings` or `service`. The job name is passed with `set_config('app.audit_actor', 'cron:expire_unpaid_bookings', true)` at the top of each job function. If not set, use `system`.

## 3. Database (migration `202611200001_audit_log.sql`)

### 3.1 Table

```sql
create table public.audit_log (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  actor_id uuid,                              -- no FK, history must survive user deletion
  actor_role text not null default 'system'   -- admin | owner | customer | system
    check (actor_role in ('admin','owner','customer','system')),
  actor_label text,                           -- name snapshot, or 'cron:...' / 'service'
  action text not null,                       -- e.g. 'owner.updated', 'booking.status_changed', 'document.viewed'
  entity_type text not null,                  -- 'owner','booking','car','customer','application',...
  entity_id text,                             -- uuid as text
  entity_label text,                          -- snapshot: business name, booking reference, ...
  summary text not null,                      -- plain-English one-liner
  changes jsonb not null default '{}'::jsonb, -- {"commission_rate":{"from":0.05,"to":0.03}}
  reason text,
  metadata jsonb not null default '{}'::jsonb,
  constraint audit_log_size check (pg_column_size(changes) < 16384 and pg_column_size(metadata) < 8192)
);
create index audit_log_created_idx on public.audit_log (created_at desc, id desc);
create index audit_log_entity_idx  on public.audit_log (entity_type, entity_id, created_at desc);
create index audit_log_actor_idx   on public.audit_log (actor_id, created_at desc);
create index audit_log_action_idx  on public.audit_log (action, created_at desc);

alter table public.audit_log enable row level security;
revoke all on public.audit_log from anon, authenticated;
grant select on public.audit_log to authenticated;
create policy "Admins read audit log" on public.audit_log for select to authenticated using (public.is_admin());
-- No insert/update/delete policies or grants for anyone. Rows are written only by the definer functions below.
```

### 3.2 Immutability

```sql
create or replace function public.audit_log_immutable() returns trigger language plpgsql as $$
begin raise exception 'The audit log is append-only.'; end $$;
create trigger audit_log_no_update before update or delete on public.audit_log
  for each row execute function public.audit_log_immutable();
create trigger audit_log_no_truncate before truncate on public.audit_log
  for each statement execute function public.audit_log_immutable();
revoke all on function public.audit_log_immutable() from public, anon, authenticated;
```
Retention is a manual, documented operation (for example a reviewed migration), not an app feature. Default policy: keep **24 months**.

### 3.3 Writer and trigger function

Internal writer (no client grants):

```sql
create or replace function public.audit_write(
  p_action text, p_entity_type text, p_entity_id text, p_label text,
  p_summary text, p_changes jsonb default '{}', p_reason text default null, p_metadata jsonb default '{}')
returns void language plpgsql security definer set search_path = public as $$
declare v_actor uuid := auth.uid(); v_role text := 'system'; v_name text;
begin
  if v_actor is not null then
    select coalesce(p.role::text,'customer'), p.full_name into v_role, v_name from public.profiles p where p.id = v_actor;
    v_role := coalesce(v_role, 'customer');
  else
    v_name := coalesce(nullif(current_setting('app.audit_actor', true), ''), 'system');
  end if;
  insert into public.audit_log(actor_id, actor_role, actor_label, action, entity_type, entity_id, entity_label, summary, changes, reason, metadata)
  values (v_actor, v_role, v_name, p_action, p_entity_type, p_entity_id, p_label, left(p_summary, 500), coalesce(p_changes,'{}'), left(p_reason, 500), coalesce(p_metadata,'{}'));
end $$;
revoke all on function public.audit_write(text,text,text,text,text,jsonb,text,jsonb) from public, anon, authenticated;
```

Generic row trigger (reference implementation; Codex must test it on every table and adapt):

```sql
-- usage: create trigger audit_owners after insert or update or delete on public.owners
--   for each row execute function public.audit_row_change('owner','business_name','business_name,commission_rate,...','contact_phone,payment_qr_path');
create or replace function public.audit_row_change() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_entity text := tg_argv[0];                       -- entity type key
  v_label_cols text[] := string_to_array(tg_argv[1], ' ');  -- columns concatenated for the label
  v_tracked text[] := string_to_array(tg_argv[2], ',');
  v_masked  text[] := coalesce(string_to_array(nullif(tg_argv[3],''), ','), '{}');
  v_old jsonb := case when tg_op in ('UPDATE','DELETE') then to_jsonb(old) end;
  v_new jsonb := case when tg_op in ('INSERT','UPDATE') then to_jsonb(new) end;
  v_row jsonb := coalesce(v_new, v_old);
  v_changes jsonb := '{}'::jsonb; v_col text; v_label text; v_summary text; v_action text; v_reason text;
begin
  select string_agg(nullif(v_row->>c, ''), ' ') into v_label from unnest(v_label_cols) c;
  if tg_op = 'UPDATE' then
    foreach v_col in array v_tracked || v_masked loop
      if (v_old->v_col) is distinct from (v_new->v_col) then
        if v_col = any(v_masked) then
          v_changes := v_changes || jsonb_build_object(v_col, jsonb_build_object('masked', true));
        else
          v_changes := v_changes || jsonb_build_object(v_col, jsonb_build_object('from', left(v_old->>v_col, 300), 'to', left(v_new->>v_col, 300)));
        end if;
      end if;
    end loop;
    if v_changes = '{}'::jsonb then return new; end if;           -- no tracked change: log nothing
    v_action := v_entity || case when v_changes ? 'status' and (select count(*) from jsonb_object_keys(v_changes)) = 1
                                 then '.status_changed' else '.updated' end;
    v_summary := format('%s updated: %s', coalesce(v_label, v_entity), (
      select string_agg(case when value ? 'masked' then key || ' changed'
                             else key || ' ' || coalesce(value->>'from','empty') || ' → ' || coalesce(value->>'to','empty') end, '; ')
      from jsonb_each(v_changes)));
  elsif tg_op = 'INSERT' then
    v_action := v_entity || '.created'; v_summary := format('%s created', coalesce(v_label, v_entity));
    -- store only tracked, non-masked values
    select coalesce(jsonb_object_agg(c, jsonb_build_object('to', left(v_new->>c, 300))), '{}') into v_changes
      from unnest(v_tracked) c where v_new->>c is not null;
  else
    v_action := v_entity || '.deleted'; v_summary := format('%s deleted', coalesce(v_label, v_entity));
  end if;
  v_reason := nullif(current_setting('app.audit_reason', true), '');
  perform public.audit_write(v_action, v_entity, v_row->>'id', v_label, v_summary, v_changes, v_reason);
  return coalesce(new, old);
end $$;
revoke all on function public.audit_row_change() from public, anon, authenticated;
```

Implementation notes:
- Triggers are `after` triggers, one per tracked table, named `audit_<table>`. The `tg_argv` order is: entity key, label columns (space separated), tracked columns (comma separated), masked columns (comma separated).
- **Reason capture:** inside any definer function that already receives a reason or note (reject payment, cancel booking, reject top-up, customer verification, and so on) call `perform set_config('app.audit_reason', coalesce(p_reason,''), true);` at the top. The setting is transaction-local and is read by the trigger. Also add the same line to functions that gain a reason later. Reasons stored in a column (`reject_reason`, `admin_note`) are captured in the diff anyway.
- **System jobs:** at the top of each cron or webhook function (for example `expire_unpaid_bookings`) call `perform set_config('app.audit_actor','cron:expire_unpaid_bookings', true);`.
- **Numbers and dates:** values are stored as text snapshots (`->>`); the UI formats them using the column label map in section 6.
- **Bulk operations** (generate invoices, expiring many bookings) create one row per record. Do not suppress them. The UI groups consecutive identical system events visually (optional).
- **Not-null label:** `v_label` may be null for some tables; the UI falls back to the entity type and id.
- Triggers must not break existing triggers or the `notify_*` triggers; keep audit triggers `after` and name them so they sort **after** existing triggers (alphabetical firing order) or document that order does not matter.
- Test insert and update by `authenticated` users (owner, customer) too: the trigger runs as definer, so RLS does not block the log write.

### 3.4 Explicit event function (admin session only)

```sql
create or replace function public.admin_log_event(
  p_action text, p_entity_type text, p_entity_id text, p_label text, p_reason text default null, p_metadata jsonb default '{}')
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Administrator access required.'; end if;
  if p_action not in ('document.viewed','audit.exported') then raise exception 'Unknown audit action.'; end if;
  perform public.audit_write(p_action, p_entity_type, p_entity_id, p_label,
    case p_action when 'document.viewed' then format('Viewed %s of %s', coalesce(p_metadata->>'document','a document'), coalesce(p_label, 'a customer'))
                  else 'Exported the audit log' end,
    '{}', p_reason, p_metadata);
end $$;
revoke all on function public.admin_log_event(text,text,text,text,text,jsonb) from public, anon;
grant execute on function public.admin_log_event(text,text,text,text,text,jsonb) to authenticated;
```
The action whitelist stops the admin UI (or a compromised admin session) from forging arbitrary events. Metadata is limited by the table size constraint; never put file paths, signed URLs or personal numbers in it (`document` is just `"driver's license"` or `"ID"`).

### 3.5 Attach triggers
Create the `audit_*` triggers for every table in section 2.1 with the exact column lists verified from the migrations (and from `\d+` on the real database). For tables that do not exist yet (plans, contact messages), add the trigger in the migration that creates them.

### 3.6 Backfill
No backfill. Start the history from deployment. Optionally insert one `system` row *Audit log enabled* so the first entry explains the cutoff.

## 4. Admin UI

### 4.1 `/admin/audit-log` (new; add **Audit log** to the admin sidebar under Settings)

Server component, admin only (use the same admin guard as other admin pages). All filters live in the URL and are validated with zod; invalid values are ignored.

**Filters (top bar, wraps on mobile):**
- Date range (default **last 7 days**; presets Today, 7 days, 30 days, Custom), interpreted in **Asia/Manila**.
- Actor role: All, Admin, Owner, Customer, System.
- Actor search (by name).
- Entity type select: Owner, Customer, Booking, Vehicle, Application, Payment, Top-up, Invoice, Setting, Promo, Plan…
- Action select (grouped: Created, Updated, Status changed, Deleted, Security).
- Text search over `summary` and `entity_label` (escape `%` and `_`, use `ilike`, max 80 chars).
- Toggle **Has reason**.
- **Clear filters** button.

**Table (desktop):** columns **When** (relative text plus exact `Asia/Manila` time on hover/focus; format `Nov 20, 2026, 8:16 AM`), **Who** (name plus role badge; System shows the job), **What** (action chip + short title), **Record** (entity label, linked to its admin page when one exists), **Details** (first two changes as `Commission rate 5% → 3%`, `+2 more`), **Reason** (truncated). Rows are keyboard focusable; Enter or click opens the drawer.
**Mobile (390px):** cards with the same fields stacked; no horizontal scroll.
**Pagination:** keyset (`id < cursor`, 50 per page, `order by id desc`), **Newer / Older** buttons; no total count. Page size fixed at 50.
**States:** loading skeleton rows, empty (*No activity for these filters*, **Clear filters**), error (*Could not load the audit log. Try again.*).

**Detail drawer** (right side, full-screen on mobile): header with action chip and exact time; Who (name, role, id); Record (type, label, id with copy button, link); **Changes** table (Field, From, To) using friendly labels and formats; Reason; Metadata (key/value, plain text); **View history of this record** (sets the entity filter); event id. Focus is trapped, Escape closes, focus returns to the row.

**Export CSV:** button **Export** exports the current filters, **max 5,000 rows**, from `app/admin/audit-log/export/route.ts` (GET, admin check, validated filters, `Content-Disposition: attachment`, UTF-8 with BOM, CSV-injection safe: prefix cells starting with `= + - @` with `'`). Each export calls `admin_log_event('audit.exported', ...)` with the filters in `metadata`. Show a SweetAlert/toast when started if available.

### 4.2 Record history panel (`EntityHistory`)
A reusable card (last 20 events for one record, newest first, *View all* link to `/admin/audit-log?entity_type=…&entity_id=…`) placed on:
- Owners (`/admin/owners` row detail or owner page, including payment terms and plan section).
- Customers (`/admin/customers` row/drawer: verification and document history).
- Bookings (`/admin/bookings`: status changes, payments, refunds).
- Vehicles (`/admin/cars`).
- Owner applications (decision trail).
Show compact rows: relative time, who, one-line summary. Use `entity_type` + `entity_id` (index `audit_log_entity_idx`). For bookings also include `payments` rows for that booking: store `metadata.booking_id` in payment events, or query by `entity_type='payment'` plus `metadata->>'booking_id'` (add a small `v_meta` argument in the trigger for tables that have a parent id).

### 4.3 Recent activity card on `/admin`
Last 8 events (any actor), with **View audit log**. Hide silently if the query fails.

### 4.4 Labels and formatting (`lib/audit/labels.ts`)
- `ACTION_LABELS`: `owner.updated → "Owner updated"`, `booking.status_changed → "Booking status changed"`, `document.viewed → "Document viewed"`, etc. Unknown actions fall back to a humanized version.
- `COLUMN_LABELS`: `commission_rate → "Commission rate"` (format as percent), `fee_mode → "Fee mode"`, `is_active → "Active"` (Yes/No), `payment_qr_verified → "Payment QR verified"`, `total_price`/`amount`/`deposit_amount` (format with `formatPeso`), `status` (humanize), dates (Asia/Manila).
- Masked changes render as *“Phone number changed”* with a lock icon and no values.
- Action chip colors: created = green `#1E8E5A`, updated = blue `#0B63CE`, status changed = amber `#B7791F`, deleted/rejected = red `#C62828`, security/viewed/exported = gray `#51657F`. Never rely on color alone (text label always present).

## 5. Code structure

```
supabase/migrations/202611200001_audit_log.sql
lib/audit/
  types.ts          // AuditRow, AuditFilters
  filters.ts        // zod schema, parse/build search params, date range in Asia/Manila
  queries.ts        // listAudit(filters, cursor), entityHistory(type,id,limit), recentActivity(limit)
  labels.ts         // action/column labels and value formatting
  csv.ts            // safe CSV builder (formula-injection guard)
  actions.ts        // server actions: logDocumentView(customerId, documentKind), logExport(filters)
app/admin/audit-log/
  page.tsx          // server component
  loading.tsx
  export/route.ts
components/admin/audit/
  AuditTable.tsx  AuditFilters.tsx  AuditDrawer.tsx
  EntityHistory.tsx  RecentActivity.tsx  ActionChip.tsx  ChangeList.tsx
```

Where to call `logDocumentView`: in the existing admin code that creates a signed URL for a customer or applicant document (for example `viewDocument` in `components/admin/customer-manager.tsx` and the application review). Call it **before** returning the signed URL; if logging fails, do **not** show the document (fail closed).

## 6. Security and privacy

- `audit_log` readable by admins only (RLS); no write grants for any API role; immutable by triggers (even the service role).
- Definer functions use `set search_path = public`; `audit_write`, `audit_row_change` and `audit_log_immutable` have **no** client EXECUTE; `admin_log_event` is admin-only with an action whitelist.
- Sensitive values are masked or omitted (passwords and tokens never exist in these tables; phone, email, document paths, QR paths and proof paths are masked). Reasons are free text typed by staff: warn in the UI *Do not put ID numbers or bank details in reasons*.
- Render every value as **plain text**; never `dangerouslySetInnerHTML` or SweetAlert `html:` with log data.
- Search input is escaped; the CSV export guards against spreadsheet formula injection; export size is capped and itself logged.
- The log contains personal data (names, actions about customers). Keep it admin-only, keep to the stated retention, and do not expose it through public APIs. Review Data Privacy Act obligations with a professional before launch.
- Do not log inside the audit trigger itself (no recursion): `audit_log` has no audit trigger.
- Performance: indexes above; the page queries with a bounded date range and keyset pagination; avoid `count(*)` over the whole table.

## 7. Test plan

SQL (using `set local role authenticated` with JWT claims, plus service role where noted):
1. Admin updates `owners.commission_rate` 0.05 → 0.03 → one row: actor admin, action `owner.updated`, `changes.commission_rate = {from:'0.05', to:'0.03'}`, summary readable.
2. Update that changes only untracked columns (or no values) → **no row**.
3. Update `owners.contact_phone` → row exists with `{masked:true}`, no value stored.
4. Owner publishes a vehicle (`is_active`) → row actor role `owner` (trigger writes even though owners cannot read the log).
5. A pg_cron-style call with no JWT and `app.audit_actor` set → actor role `system`, label `cron:…`.
6. `reject_booking_payment` with a reason → row contains the reason (from `app.audit_reason`); the setting does not leak into the next transaction.
7. Customer and owner `select` from `audit_log` → zero rows; anonymous → permission denied.
8. `update`, `delete` and `truncate` on `audit_log` by admin and by service role → exception *The audit log is append-only.*
9. `admin_log_event` with an unknown action → exception; by a non-admin → *Administrator access required.*; anonymous → denied.
10. A failed business transaction (forced error after the update) leaves **no** audit row.
11. Insert size guard: a very long text value is truncated to 300 characters in `changes`.
12. Existing flows still work: booking create, payment confirm, owner approval, top-up review, notifications are unchanged.

App:
- Filters round-trip through the URL; invalid values are ignored; the default is the last 7 days in Asia/Manila; date edges are inclusive (start of day to end of day Manila).
- Keyset pagination: Older then Newer returns consistent pages with no duplicates when new rows arrive.
- Drawer shows friendly labels and formats; masked values show a lock note; keyboard and screen reader work.
- `EntityHistory` shows only events for that record and links to the filtered log.
- `logDocumentView` is written before the signed URL is shown; if it fails the document is not shown.
- CSV export respects filters, caps at 5,000 rows, escapes formula cells, and creates an `audit.exported` row.
- Mobile 390px: no horizontal scroll; filters collapse into a drawer or wrap.
- `npm run lint`, `npx tsc --noEmit`, `npm run build`.

## 8. Build order (one commit per step)

1. Migration: table, immutability, `audit_write`, `audit_row_change`, `admin_log_event`, triggers on **owners, bookings, payments, owner_credit_ledger, profiles, owner_applications** first. Run SQL tests 1 to 12.
2. Add the rest of the tracked tables, plus `set_config('app.audit_reason', ...)` and `app.audit_actor` lines in existing definer and cron functions.
3. `lib/audit/*` (filters, queries, labels, CSV) with unit tests for filters, label formatting and CSV escaping.
4. `/admin/audit-log` page, drawer, export route, sidebar link.
5. `EntityHistory` on owners, customers, bookings, vehicles, applications; **Recent activity** on `/admin`.
6. `logDocumentView` wiring for customer and application documents.
7. Final pass: accessibility, mobile, loading and error states, security checklist, performance check with 10,000 sample rows.

## 9. Acceptance checklist

- [ ] Every tracked change by admin, owner, customer or system produces one readable audit row in the same transaction.
- [ ] No-op updates and untracked columns produce no rows; masked fields never store values.
- [ ] The log cannot be changed or deleted by anyone through the app, API or service role.
- [ ] Only admins can read it; owners, customers and anonymous users get nothing.
- [ ] `/admin/audit-log` filters by date, actor role, actor, entity type, action, text and reason; paginates by cursor; opens a detail drawer with from → to changes.
- [ ] CSV export works with filters, is capped, safe against formula injection, and is itself logged.
- [ ] Record pages show a **History** panel; the admin overview shows **Recent activity**.
- [ ] Viewing a customer's or applicant's documents is logged before the file is shown.
- [ ] Reasons entered in reject, cancel and review actions appear in the log.
- [ ] System jobs show as System with the job name.
- [ ] All times display in Asia/Manila; amounts, percentages and booleans are formatted.
- [ ] Mobile layout works; accessible (focus trap, labels, text not color-only).
- [ ] Existing booking, payment, notification and onboarding flows still pass; lint, typecheck, build and SQL tests pass.

## 10. Optional later (not in v1)

- Tamper evidence: add `prev_hash` and `hash` (sha256 over the row and the previous hash) with a per-table advisory lock, plus an admin "verify chain" button.
- Owner-facing history of their own bookings and plan (separate, filtered view; never the global log).
- Alerts: notify admins on sensitive events (commission changed, many failed actions, bulk deletes).
- Monthly archive to storage with a retention job.

## 11. Codex prompt

*"Implement the audit log following `kuyog-bohol-audit-log.md`. First read every migration to confirm the real table and column names, the existing definer functions and cron jobs, and the admin pages and components named in sections 0 and 5, and follow their patterns. Build in the order of section 8: migration with immutability, writer, generic trigger, explicit event function and triggers on the core tables, with SQL tests; then the remaining tables and the `app.audit_reason` and `app.audit_actor` hooks; then `lib/audit`, the `/admin/audit-log` page with filters, drawer and CSV export; then history panels, the recent activity card and document-view logging. Capture changes in the database, never in the UI. Never store secrets, tokens, signed URLs, document paths, QR or proof paths, or bank numbers. Render all log values as plain text. Keep all existing behavior working. Never print or commit secrets. Run lint, typecheck, build and the SQL tests, and list anything you could not verify."*
