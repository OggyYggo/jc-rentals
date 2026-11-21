# Kuyog Bohol — Cancellation & Refund Policy (Implementation Spec for Codex)

**Repo:** `OggyYggo/jc-rentals` (Next.js 16 App Router, React 19, TypeScript, Supabase Postgres + RLS, Resend).
**Goal:** a simple, visible cancellation rule. **Free cancellation until 24 hours before the rental starts. After that, the owner keeps a cancellation fee taken from the reservation payment, and the platform earns its commission on that fee.** Owner-caused cancellations are always fully refunded.
**Related specs:** `kuyog-bohol-pricing-and-plans.md`, `kuyog-bohol-audit-log.md`, `kuyog-bohol-sweetalert.md`, `kuyog-bohol-admin-email-alerts.md`, receipts (see section 9).

> Next.js 16 here has breaking changes. Read the relevant guide in `node_modules/next/dist/docs/` before writing routes or server actions, and follow the existing patterns in the repo.

---

## 0. What exists today (read these first, do not assume)

Migration `202611060003_payment_qr_module.sql`:
- `cancel_booking(p_booking_id, p_reason)` (definer): allowed for the customer, the owner or an admin; statuses `awaiting_payment`, `payment_review`, `confirmed`; a customer can cancel only before `start_date` (Asia/Manila). It reverses the platform fee (`owner_credit_ledger` type `fee_refund`, sets `platform_fee_charged = false`), rejects pending payments, sets `cancelled`, and sets `deposit_refund_status = 'owed'` if any money was paid. **Every cancellation is a full refund, with no time limit and no fee.**
- `mark_deposit_refunded(p_booking_id)`: owner or admin marks `deposit_refund_status = 'refunded'`, `payment = 'refunded'`.
- Booking money fields: `total_price`, `amount_due_now` (reservation payment = total × deposit percent, default 30%), `balance_at_pickup`, `amount_paid_online`, `commission_rate`, `commission_amount`, `owner_earnings`, `platform_fee_charged`, `payment_due_at`, `deposit_amount` (the separate **safety deposit**, self-drive only).
- Commission reports (`/admin`, `/admin/commissions`, owner earnings) count only `confirmed, picked_up, returned, completed`.
- Fee modes: credits (prepaid) or invoice (`commission_invoices`). Read how `platform_fee_charged` and `owner_credit_ledger` are used before changing anything.

The **safety deposit** (`deposit_amount`) is a different thing and is **not** changed by this spec.

## 1. Decisions

| Topic | Decision |
|---|---|
| Free cancellation window | **24 hours** before the rental start (platform default, admin can change it) |
| Start moment | `start_date` at `pickup_reference_hour` (default **08:00** Asia/Manila, a platform setting). If bookings later get a real pickup time, use that instead |
| Cancellation after the window | The owner keeps **50%** of the reservation payment received (`cancel_fee_percent`, default 50, range 0–100). The rest is refunded to the customer |
| Per-owner override | Optional: an owner can have a different window and percent, set by admin (not by the owner), within platform limits (window 0–168 h, percent 0–100) |
| Snapshot | The policy that applied **when the booking was created** is saved on the booking. Changing the settings later never changes existing bookings |
| Owner cancels, owner rejects payment, vehicle unavailable | **Always a full refund**, any time, no fee |
| Admin cancels | Admin picks **Full refund** or **Apply policy**, with a required reason |
| Customer no-show | The owner can cancel with reason **No-show**. The policy fee applies (the window has passed) |
| Unpaid or expired bookings | Unchanged (they expire after the payment window, nothing to refund) |
| Platform commission | If a fee is kept, the platform earns `commission_rate` of the **kept fee**. If fully refunded, the platform earns nothing (current behavior) |
| Money flow | Unchanged. The customer paid the owner directly, so the **owner** sends the refund and marks it refunded |
| Transparency | The policy is shown on the vehicle page, booking summary, payment page, booking details, emails, receipt and the Terms page |

Worked example (total ₱4,000, reservation 30% = ₱1,200 paid, commission 5%):
- Cancel more than 24 h before start: refund ₱1,200, owner keeps ₱0, platform earns ₱0.
- Cancel within 24 h: owner keeps 50% = ₱600, refund ₱600, platform earns 5% of ₱600 = ₱30.

## 2. Database (migration `202611210001_cancellation_policy.sql`)

Settings (insert into the existing `settings` table, same pattern as `deposit_percent`):
`cancellation_free_hours` = `24`, `cancellation_fee_percent` = `50`, `pickup_reference_hour` = `8`.

```sql
alter table public.owners
  add column if not exists cancellation_free_hours integer check (cancellation_free_hours between 0 and 168),
  add column if not exists cancellation_fee_percent numeric(5,2) check (cancellation_fee_percent between 0 and 100);
-- NULL = use the platform setting. Add both columns to the existing owners update guard so owners cannot change them.

alter table public.bookings
  add column if not exists cancel_free_until timestamptz,             -- snapshot: last moment for a free cancellation
  add column if not exists cancel_fee_percent numeric(5,2),           -- snapshot
  add column if not exists cancelled_at timestamptz,
  add column if not exists cancelled_by uuid references public.profiles(id),
  add column if not exists cancelled_by_role text check (cancelled_by_role in ('customer','owner','admin','system')),
  add column if not exists cancel_kind text check (cancel_kind in ('free','late','no_show','owner','admin_full','admin_policy')),
  add column if not exists cancel_fee_amount numeric(10,2) not null default 0 check (cancel_fee_amount >= 0),
  add column if not exists refund_amount numeric(10,2) not null default 0 check (refund_amount >= 0),
  add column if not exists refund_reference text check (char_length(refund_reference) <= 80),
  add column if not exists refunded_at timestamptz;
```

Snapshot at creation: extend the existing `assign_booking_owner_and_earnings` trigger (the one that sets `amount_due_now`, `payment_due_at`) to also set:
- `cancel_free_until := (start_date + make_interval(hours => pickup_reference_hour)) at time zone 'Asia/Manila' - make_interval(hours => free_hours)`
- `cancel_fee_percent := coalesce(owner value, platform value)`
using `coalesce(owner.cancellation_free_hours, setting, 24)` and the same for the percent, clamped to the allowed ranges. Backfill existing active bookings with the platform defaults.

**Replace `cancel_booking`** (keep the signature and add an optional third argument, so existing callers still work):

```sql
create or replace function public.cancel_booking(
  p_booking_id uuid, p_reason text, p_mode text default 'auto')  -- 'auto' | 'full_refund' | 'no_show'
returns jsonb ...  -- security definer, set search_path = ''
```
Logic, in order:
1. Same lookup, row lock and permission checks as today. Statuses allowed: `awaiting_payment`, `payment_review`, `confirmed`. Customers still cannot cancel after the rental starts.
2. Work out `v_paid` = sum of **verified** payments (or `amount_paid_online`, use whatever the repo treats as the source of truth). If `v_paid = 0` → cancel with `cancel_kind = 'free'`, no fee, no refund.
3. Decide the kind:
   - caller is the **owner** (not an admin) and `p_mode` is not `no_show` → `owner`, full refund.
   - `p_mode = 'no_show'` → only the owner or an admin, only when `start_date <= today (Asia/Manila)` → `no_show`, policy fee applies.
   - caller is an **admin**: `p_mode = 'full_refund'` → `admin_full`; otherwise `admin_policy`. A reason of at least 3 characters is required for admin and owner cancellations.
   - caller is the **customer**: `now() <= cancel_free_until` → `free`; else `late`.
4. For `late`, `no_show` and `admin_policy`: `fee := round(v_paid * cancel_fee_percent / 100, 2)`; otherwise `fee := 0`. `refund := v_paid - fee`.
5. Commission handling:
   - If `fee = 0` (full refund) → exactly the current behavior (refund the platform fee if it was charged, `platform_fee_charged = false`, no commission).
   - If `fee > 0` → recompute `commission_amount := round(fee * commission_rate, 2)` and `owner_earnings := fee - commission_amount`. If the platform fee had already been charged on the full booking, post a `fee_refund` for the **difference** (`old_commission - new_commission`) and keep `platform_fee_charged = true` for the remaining fee; in invoice mode, adjust the pending invoice line the same way. Read the existing fee code and mirror it. Never charge the owner more than the new commission.
6. Update the booking: `status = 'cancelled'`, `cancelled_at`, `cancelled_by`, `cancelled_by_role`, `cancel_kind`, `cancel_reason`, `cancel_fee_amount`, `refund_amount`, and `deposit_refund_status = 'owed'` only if `refund > 0` (else `'none'`). Reject pending payments exactly as today.
7. Write to the audit log (`audit_write`, see the audit log spec), notify (section 7), and return `{ kind, fee, refund, commission }` so the UI can show the result.

New read-only helper used by the UI to preview the result **before** confirming (so the customer sees the numbers):

```sql
create function public.cancellation_preview(p_booking_id uuid)
returns jsonb  -- { can_cancel, kind, free_until, paid, fee, refund, fee_percent }
-- security definer, stable; same permission rule as cancel_booking (customer of the booking, its owner, or admin); revoke from public, anon; grant to authenticated.
```

`mark_deposit_refunded(p_booking_id, p_reference text default null)`: keep the checks, store `refund_reference` (optional, max 80 chars) and `refunded_at`, and keep `deposit_refund_status = 'refunded'`. Do not set `payment = 'refunded'` when only a **partial** refund was made (`fee > 0`); use the existing `payment` value that best matches "partially refunded" or add one value to the enum only if needed, and check where the enum is used.

Reports: include cancelled bookings with `cancel_fee_amount > 0` in the commission views and exports (`app/admin/commissions`, `app/admin/page.tsx`, `app/owner/earnings`, `app/owner/page.tsx`). Revenue is the **fee**, not `total_price`. Label them **Cancelled (fee kept)**. Cancelled bookings with a fee of 0 stay excluded.

Constraints: `refund_amount + cancel_fee_amount <= amount actually paid`; all three functions `security definer`, explicit `search_path`, `revoke ... from public, anon`, `grant execute ... to authenticated`; no new `anon` access; add the new `bookings` columns to any column-grant lists and views that expose booking fields (customers and owners may read them, they may not write them).

## 3. Settings and admin UI

- `/admin/settings` → section **Cancellation policy**: free window (hours), fee percent, pickup reference hour, live example (*"Cancel up to 24 h before the rental starts: full refund. After that: 50% of your reservation payment is kept by the owner."*). Saving needs a confirm and is audit logged. Changes apply only to **new** bookings.
- `/admin/owners/[id]` → **Policy override** card (window and percent, blank = platform default, same validation, audit logged).
- Admin booking view: show the snapshot (free until, fee percent), cancel kind, fee, refund, and who cancelled. The cancel dialog offers **Full refund** and **Apply policy** with a required reason and a preview.

## 4. Customer UI

- **Vehicle page and booking summary** (`app/cars/[id]`): a short line *Free cancellation until {date, time}* and a **Cancellation policy** expandable with the exact rule and an example in pesos for this booking.
- **Payment page and booking details:** the same line, plus after payment *Cancel free until {time}*; after that time *Cancelling now keeps {percent}% of your reservation payment*.
- **Cancel flow** (`components/customer/booking-list.tsx`): the cancel button calls `cancellation_preview` and opens a SweetAlert confirm showing: what was paid, the fee that will be kept (if any), the amount that will be refunded, a required reason (select plus note), and the button text *Cancel and request refund of ₱X*. After success show a status card **Refund pending (owner sends it)**, then **Refunded** when the owner marks it. Friendly errors for the stable cases.
- Never promise a refund date. Say *The owner sends your refund to the account you paid from. Contact support if you haven't received it within 3 days.* (the 3 days is a text setting, not enforced).

## 5. Owner UI

- Owner booking list and workflow: **Cancel booking** (always full refund, reason required) and **Customer didn't show up** (no-show, available once the start date has arrived; applies the fee). Both use a preview dialog.
- A **Refunds to send** queue (owner dashboard card and list): booking, customer name, amount to refund, time since cancellation, **Mark as refunded** with an optional reference number. Overdue after 3 days shows a warning chip. Admin sees the same queue across owners.
- Earnings: cancelled bookings with a kept fee show the fee, the platform commission and the owner's net.

## 6. Security and abuse

- All amounts are computed **in the database** from verified payments and the booking snapshot; the client sends only the booking id, reason and mode.
- Customers cannot choose `full_refund` or `no_show`; those modes are checked against the caller's role.
- The snapshot prevents rules from being changed after the fact; only admins can change settings and overrides, both audit logged.
- Preview and cancel use the same code path so numbers always match.
- Owners cannot hide cancellations; every cancellation, refund mark and policy change appears in the audit log and admin history.
- Notification and email text never include payment proof links.

## 7. Notifications (`notify()`; in-app, email and push for money events)

- To the owner: `booking_cancelled` (who, kind, fee and refund amounts, link to the refund queue if a refund is owed).
- To the customer: `booking_cancelled_confirmation` (what happens next and the amounts) and `refund_sent` when marked refunded.
- To admins: only `refund overdue` (daily digest, per the admin alerts spec), not each cancellation.
- Reminder to the owner at 24 h and 72 h after cancellation if a refund is still owed (dedupe per booking and step).

## 8. Terms, copy and legal

- Update the **Terms** page cancellation section and add a plain-language **Cancellation & refunds** block. Use the same numbers as the settings (render them from the settings so text and rules cannot drift).
- Put the sentence *"The refund is sent by the vehicle owner. Kuyog Bohol helps record and track it."* wherever refunds are mentioned, because the app does not hold the money.
- Before launch, have the policy and the percent reviewed against consumer-protection requirements (for example DTI guidance); this spec does not give legal advice.

## 9. Receipt and other specs

When the receipt spec (payment receipts with deposit lines) is built, add a **Cancellation** section: *Cancelled on {date} by {role}. Fee kept: ₱X. Refund: ₱Y ({status}).* and mark the original receipt **Voided / Partially refunded**. Receipts are never deleted.

## 10. Test plan

SQL (role switching and JWT claims):
1. Customer cancels with `now() <= cancel_free_until`: kind `free`, fee 0, refund = paid, `deposit_refund_status = 'owed'`, commission 0, `platform_fee_charged` false, and a `fee_refund` posted if the fee had been charged.
2. Customer cancels after the window: kind `late`, fee = `paid × percent`, refund = `paid − fee`, commission = `fee × rate`, a partial `fee_refund` posted for the difference, owner earnings correct.
3. Exactly at `cancel_free_until` (boundary) is still free; one second later is late.
4. Owner cancel and owner rejection: full refund at any time; owner `no_show` before the start date is rejected; after it, the fee applies.
5. Admin `full_refund` vs `apply_policy`; a reason is required (2 characters fails).
6. Unpaid booking: no refund, no fee. Booking already `picked_up` or later: cannot be cancelled. A customer cannot cancel after `start_date`.
7. Changing platform settings or an owner override does not change existing bookings (snapshot); new bookings use the new values; out-of-range values are rejected; owners cannot update their own override columns.
8. `cancellation_preview` equals the result of `cancel_booking` for each case; non-participants cannot call either.
9. `mark_deposit_refunded` stores the reference and time, rejects wrong states, and handles partial refunds without marking the booking as fully refunded.
10. Reports: a cancelled booking with a fee appears in commissions with the fee as revenue; a cancelled booking without a fee does not; totals match a manual calculation.
11. Credits mode and invoice mode both reconcile (ledger sums and invoice lines match commission after cancellation).
12. Anonymous users have no EXECUTE on any new or changed function.

App:
- The cancel dialog shows the correct amounts at both sides of the window; cancel confirmation and refund status cards render; refund queue works and marks refunded.
- Policy text appears on the vehicle page, payment page, booking details, emails and Terms, and all use the same numbers.
- 390px layout for dialogs and queues; keyboard and screen reader checks on the dialogs.
- `npm run lint`, `npx tsc --noEmit`, `npm run build`.

## 11. Build order (one commit per step)

1. Migration: settings, owner and booking columns, snapshot trigger and backfill, new `cancel_booking`, `cancellation_preview`, `mark_deposit_refunded`; SQL tests 1 to 9 and 12.
2. Commission and report changes, credits and invoice reconciliation; tests 10 and 11.
3. Admin settings and owner override UI.
4. Customer UI: policy lines, preview dialog, refund status.
5. Owner UI: cancel, no-show, refund queue.
6. Notifications and reminders; Terms page text.
7. Polish: SweetAlert wording, loading and error states, mobile and accessibility pass.

## 12. Acceptance checklist

- [ ] A customer who cancels more than 24 hours before the start gets a full refund and the platform earns nothing.
- [ ] A customer who cancels inside 24 hours sees the exact fee and refund **before** confirming; the owner keeps the fee and the platform earns its commission on that fee only.
- [ ] Owner-caused cancellations are always fully refunded; no-shows apply the fee; admin chooses full refund or policy with a reason.
- [ ] The window, percent and pickup reference hour are editable in admin settings, with optional per-owner overrides; changes affect only new bookings.
- [ ] Owners get a Refunds-to-send queue with reminders and can record a reference; customers see the refund status.
- [ ] The policy is shown on the vehicle page, payment page, booking details, emails, receipt and Terms, from the same settings.
- [ ] Commission reports, owner earnings, credits and invoices stay consistent after cancellations.
- [ ] Every cancellation, refund mark and policy change is audit logged.
- [ ] No new `anon` EXECUTE; amounts are never taken from the client.
- [ ] Lint, typecheck, build and all tests pass.

## 13. Codex prompt

*"Implement the cancellation policy following `kuyog-bohol-cancellation-policy.md`. First read `supabase/migrations/202611060003_payment_qr_module.sql` (cancel_booking, mark_deposit_refunded, the booking pricing trigger, fee and credit handling), the commission views and pages, `components/customer/booking-list.tsx`, `components/owner/booking-workflow.tsx`, the owners update guard, and the Terms page, and follow the repo's patterns (read the Next.js 16 docs in `node_modules/next/dist/docs/` first). Keep the safety deposit untouched. Snapshot the policy on each booking, compute every amount in the database, and keep `cancellation_preview` and `cancel_booking` on the same logic. Build in the order of section 11, one commit per step. Run lint, typecheck, build and the SQL tests, and list anything you could not verify."*
