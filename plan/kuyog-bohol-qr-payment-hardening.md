# Kuyog Bohol — QR Payment Hardening (Implementation Spec for Codex)

**Repo:** `OggyYggo/jc-rentals` (Next.js 16 App Router, React 19, TypeScript, Supabase Postgres + RLS + Storage, Resend, Vercel).
**Goal:** keep the owner-direct QR payment model (customer pays the owner's own GCash, Maya or bank QR, no payment gateway, no business permit needed) but make it safe, traceable and hard to abuse, and fix two real flow problems found in the current code.
**Related specs:** `kuyog-bohol-audit-log.md`, `kuyog-bohol-admin-email-alerts.md`, `kuyog-bohol-pricing-and-plans.md`, `kuyog-bohol-security-audit-verified.md`, `kuyog-bohol-sweetalert.md`, `kuyog-bohol-ratings-and-reviews.md`.

> Next.js 16 here has breaking changes. Read the relevant guide in `node_modules/next/dist/docs/` before writing routes, server actions or caching code, and follow the repo's existing patterns.

---

## 0. What exists today (verified in `supabase/migrations/202611060003_payment_qr_module.sql`)

- **Booking flow:** a booking is created as `awaiting_payment` with `amount_due_now` (total × reservation deposit %, default 30%, per-owner 10–100%), `balance_at_pickup`, and `payment_due_at` (default 24 h from the `payment_window_hours` setting).
- **Proof:** the customer inserts a `payments` row with `amount`, `reference_no` (required), and `proof_path` (must be `<customer_id>/<booking_id>/...`). The trigger `validate_customer_payment_proof` requires `amount = amount_due_now`, the window not expired, and booking status `awaiting_payment` or `payment_review`. A pending proof moves the booking to `payment_review`.
- **Confirm / reject:** `confirm_booking_payment(payment_id)` and `reject_booking_payment(payment_id, reason)` can be run by the **owner or an admin**. Confirm requires booking `payment_review` and `payment_due_at > now()`, and in `credits` fee mode it writes a negative `owner_credit_ledger` row for the commission (fails if credits are lower than the commission).
- **Expiry:** `expire_unpaid_bookings()` (pg_cron every 10 minutes) expires bookings in `awaiting_payment` **and `payment_review`** once `payment_due_at <= now()`, marks pending proofs rejected, and sets `deposit_refund_status = 'owed'` for those in review.
- **Cancel / refund:** `cancel_booking` sets `deposit_refund_status = 'owed'` when money was paid; `mark_deposit_refunded(booking_id)` sets `refunded`. Only a status flag is stored (no refund reference or proof).
- **Owner gating:** `owner_can_accept` requires active owner, verified QR, and (invoice mode or enough credits). QR changes reset `payment_qr_verified`.
- **Credits and invoices:** `owner_credit_ledger` (top-ups reviewed by admin), `commission_invoices` with `reference_no`, `proof_path`, `due_date`.

### Problems found (fix in this spec)

1. **A paid customer can lose the booking because the owner was slow.** A customer who submits proof well before the deadline still has the booking expire at the original `payment_due_at` if the owner has not confirmed by then, and `confirm_booking_payment` refuses to confirm after the deadline. The customer is then owed a refund through no fault of their own.
2. **A credit shortage at confirm time blocks the customer.** If the owner's credits drop below the commission between booking and confirmation, `confirm_booking_payment` raises an error and the booking sits until it expires.
3. **No duplicate detection.** `reference_no` is free text with no uniqueness, and the proof image is not fingerprinted, so the same transfer or screenshot can be reused for another booking.
4. **No owner attestation.** Confirming does not record that the owner actually saw the money in their own wallet or bank app, and no received amount or reference is compared.
5. **Refunds are only a flag.** No refund reference, proof, due date, reminder or customer-visible status.
6. **No dispute path** for "I paid but it was not confirmed", and **no receipt**.
7. **No visibility** into slow or risky owners, or suspicious proofs, for admins.

## 1. Decisions

| Topic | Decision |
|---|---|
| Money model | Unchanged: customer pays the owner directly; the platform never holds customer money; the platform fee is taken from owner credits or invoices |
| Review window | Once a proof is submitted before the deadline, the booking is **protected**: it cannot expire for the review window (default **12 hours**, setting `payment_review_hours`), regardless of `payment_due_at` |
| Owner confirmation | Must **attest** by typing the received amount and the bank or wallet reference; both must match the proof or the confirmation is refused (admin override needs a reason) |
| Duplicates | Reference numbers are unique per owner among non-rejected payments (normalized); proof images are hashed and duplicates flagged |
| Risk flags | Flags are **signals for review**, not automatic punishment, except duplicate reference which blocks |
| Credits | Warn early; never let a credit shortage silently kill a customer's paid booking |
| Refunds | Tracked with due date, reference, proof, reminders and customer-visible status |
| Receipt | A "Booking Payment Confirmation" (not an Official Receipt, no BIR claim) generated only after owner confirmation |
| Gateway | Out of scope; keep the payment layer abstract enough to add one after DTI/BIR registration |

## 2. Database (migration `202611210001_qr_payment_hardening.sql`)

All new functions: `security definer`, `set search_path = ''` (match the existing module), schema-qualified names, `revoke all ... from public, anon` (and from `authenticated` unless intentionally granted), explicit `is_admin()` or ownership checks inside. Trigger functions get no client grants. Do **not** rely on `revoke ... from public` alone; revoke from `anon` explicitly.

### 2.1 Review window (fixes problem 1)

```sql
insert into public.settings (key, value) values ('payment_review_hours', '12'::jsonb)
  on conflict (key) do nothing;   -- validate 2..72 in the admin settings action

alter table public.bookings
  add column if not exists review_due_at timestamptz,
  add column if not exists payment_flags text[] not null default '{}';
```

- When a pending proof is inserted (`move_booking_to_payment_review` trigger): set `review_due_at = now() + (payment_review_hours || ' hours')::interval`, **only if** the proof was submitted before `payment_due_at` (the existing validation already guarantees that).
- `confirm_booking_payment`: replace `payment_due_at <= now()` with `coalesce(review_due_at, payment_due_at) <= now()`.
- `reject_booking_payment` / expiry: for `payment_review`, expire only when `review_due_at <= now()`. A rejected proof returns the booking to `awaiting_payment` with its **original** `payment_due_at` (customer can resubmit only if time remains, or gets a short grace of 2 hours after a rejection; make the grace a setting `payment_resubmit_grace_hours`, default 2).
- `expire_unpaid_bookings()`: use `payment_due_at` for `awaiting_payment` and `review_due_at` for `payment_review`.
- Dates stay blocked for the car while a booking is in `payment_review`, as today.
- Reminders (see 2.8): owner at 1 h and 4 h after the proof is submitted; admin alert at 8 h; the customer is told *"The owner is checking your payment"* with the deadline.
- If the review window passes with **no** owner action, do not silently expire: set status `expired`, `deposit_refund_status = 'owed'`, flag the booking `owner_no_response`, add an owner performance event (2.7) and alert admin.

### 2.2 Unique references and proof fingerprints (fixes problem 3)

```sql
alter table public.payments
  add column if not exists reference_norm text
    generated always as (upper(regexp_replace(trim(reference_no), '[^A-Za-z0-9]', '', 'g'))) stored,
  add column if not exists proof_sha256 text,
  add column if not exists flags text[] not null default '{}';

create unique index if not exists payments_owner_reference_unique
  on public.payments (reference_norm, owner_key)
  where status in ('pending','verified') and reference_norm <> '';
```

- `owner_key`: add `owner_id` to `payments` (denormalized from the booking by the validate trigger, so the unique index can be per owner). Backfill from `bookings`. Wallet references can repeat across different wallets, so per owner is the right scope.
- The validate trigger rejects a duplicate with a friendly error code `REFERENCE_ALREADY_USED`.
- Reference format check: 6 to 40 alphanumeric characters after normalization (GCash 13 digits, Maya and bank references vary); otherwise `REFERENCE_INVALID`.
- **Proof hash:** the browser uploads to Storage and inserts the row; the hash cannot be trusted from the client. Add `POST /api/payments/[id]/fingerprint` (authenticated, rate limited): verifies the payment belongs to the caller and is `pending`, downloads the object with the service role, computes SHA-256, stores `proof_sha256` through a service-role-only function `set_payment_proof_hash(payment_id, sha256)`, and when the same hash exists on another non-rejected payment (any owner) adds the flag `duplicate_proof` to both rows and to the booking, then calls `admin_alert('payment.risk', ...)` (digest mode) and shows an owner warning. Call this route right after the insert in the client flow; if the call fails, the flag job below catches it.
- A cron `fingerprint_missing_proofs` (every 10 minutes) is **not** possible inside Postgres for storage objects; instead make the owner and admin payment review screens call the fingerprint route when `proof_sha256 is null` (lazy, idempotent). Document this.

### 2.3 Owner attestation (fixes problem 4)

```sql
alter table public.payments
  add column if not exists confirmed_amount numeric(10,2),
  add column if not exists confirmed_reference text,
  add column if not exists confirmed_ip_hash text,       -- optional, sha256(ip || secret), never raw IP
  add column if not exists confirmed_channel text check (confirmed_channel in ('owner','admin'));
```

Change the signature to `confirm_booking_payment(p_payment_id uuid, p_received_amount numeric, p_received_reference text, p_admin_note text default null)`:
- Owner path: `p_received_amount` must equal `payments.amount` and `normalize(p_received_reference)` must equal `reference_norm`; otherwise `ATTESTATION_MISMATCH`. Store both and `confirmed_channel = 'owner'`.
- Admin path (`is_admin()`): allowed to confirm on behalf of the owner only with `p_admin_note` of at least 10 characters; store `confirmed_channel = 'admin'`; notify the owner; write to the audit log.
- Keep the old one-argument function as a thin wrapper that raises `ATTESTATION_REQUIRED` for one release, then drop it; update every caller (`components/owner/payment-review.tsx`, `components/admin/payment-admin.tsx`, any route).
- UI copy: *"Open your GCash/Maya/bank app. Do you see ₱1,200.00 with reference ABC123? Type them below to confirm."*

### 2.4 Owner credit safety (fixes problem 2)

- **Hold the fee at booking creation** is too invasive for this phase. Instead:
  1. `owner_credit_state(owner_id)` returns `balance`, `pending_fees` (sum of `commission_amount` of that owner's bookings in `awaiting_payment` / `payment_review`), and `available = balance - pending_fees`.
  2. `owner_can_accept` (credits mode) uses `available >= the new booking's commission` instead of the raw balance, so an owner cannot accumulate more pending bookings than their credits can cover.
  3. If the balance is still short at confirm time (edge case), `confirm_booking_payment` does **not** fail silently: it sets the flag `owner_credit_short`, keeps the booking in `payment_review`, **extends `review_due_at` by up to 12 hours once**, notifies the owner (*"Top up ₱X to confirm this booking"*) and admins, and returns the stable code `CREDITS_SHORT`. After the extension, admin may confirm and post the fee as a negative balance (**admin override with reason**, audit logged) or cancel with a refund owed.
- Low-balance notifications to the owner (deduped per day): `credits_low` when `available < 2 × average commission of the last 30 days` (minimum threshold setting `credit_low_threshold`, default ₱200), and `credits_empty` at `available <= 0` (also in-app banner on `/owner`).
- Invoice mode: unchanged, but add a reminder 3 days before `due_date` and an overdue notice; admin can pause an owner with overdue invoices (`admin_set_owner_active` existing behavior).

### 2.5 Refund tracking (fixes problem 5)

```sql
create table public.booking_refunds (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null unique references public.bookings(id) on delete cascade,
  owner_id uuid not null references public.owners(id),
  customer_id uuid not null references public.profiles(id),
  amount numeric(10,2) not null check (amount > 0),
  status text not null default 'owed' check (status in ('owed','refunded','disputed','waived')),
  due_at timestamptz not null,                    -- created_at + refund_due_days (setting, default 3)
  refunded_at timestamptz,
  refund_reference text,
  refund_proof_path text,
  note text check (char_length(note) <= 300),
  created_at timestamptz not null default now()
);
```

- Created by the same code paths that set `deposit_refund_status = 'owed'` today (`cancel_booking`, `reject_booking_payment` after expiry, `expire_unpaid_bookings`, owner no-response). Keep `bookings.deposit_refund_status` in sync via trigger for backward compatibility.
- `mark_deposit_refunded(booking_id)` becomes `mark_booking_refunded(p_booking_id, p_reference, p_proof_path)`: owner (or admin) must give a reference and proof; customer is notified *"Your refund of ₱X was sent. Reference ..."* and can press **Not received** which sets `disputed` and alerts admin.
- Reminders: owner at creation, 1 day before `due_at`, and daily after it passes; admin alert (instant mode) when overdue by 2 days. Overdue refunds count in owner performance (2.7) and can lead to an admin pause.
- Customer sees the refund status on the booking card and booking page.

### 2.6 Payment disputes (fixes problem 6a)

```sql
create table public.payment_disputes (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings(id) on delete cascade,
  opened_by uuid not null references public.profiles(id),
  kind text not null check (kind in ('paid_not_confirmed','wrong_amount','refund_not_received','other')),
  message text not null check (char_length(message) between 10 and 1000),
  status text not null default 'open' check (status in ('open','resolved','rejected')),
  resolution text check (char_length(resolution) <= 500),
  resolved_by uuid references public.profiles(id),
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);
create unique index payment_disputes_one_open on public.payment_disputes (booking_id, kind) where status = 'open';
```

- Customers open it from the booking page (**I paid but it is not confirmed**, shown 2 hours after proof submission or after a rejection or expiry) through RPC `open_payment_dispute(p_booking, p_kind, p_message)`; owners and admins can read disputes for their bookings; only admins resolve (`admin_resolve_payment_dispute`, audit logged, reason required).
- Opening a dispute notifies the owner and admins (admin email alert, instant mode, event key `payment.dispute`), and **pauses expiry** of that booking for 24 hours (sets `review_due_at = greatest(review_due_at, now() + interval '24 hours')` once).

### 2.7 Owner payment performance and risk flags (fixes problem 7)

```sql
create table public.owner_payment_events (
  id bigint generated always as identity primary key,
  owner_id uuid not null references public.owners(id) on delete cascade,
  booking_id uuid references public.bookings(id) on delete set null,
  kind text not null check (kind in ('confirmed','rejected','no_response','refund_overdue','refund_done','dispute_opened','dispute_upheld')),
  seconds_to_act int,
  created_at timestamptz not null default now()
);
create view public.owner_payment_stats with (security_invoker = true) as
select owner_id,
  count(*) filter (where kind='confirmed') as confirmed,
  count(*) filter (where kind='no_response') as no_response,
  count(*) filter (where kind='refund_overdue') as refunds_overdue,
  percentile_cont(0.5) within group (order by seconds_to_act) filter (where kind in ('confirmed','rejected')) as median_seconds_to_act
from public.owner_payment_events where created_at > now() - interval '90 days' group by owner_id;
```

(Events are written by the existing and new payment functions; table is admin read only. Add the view to an admin-only RLS-protected path; do not expose it to anon.)

Risk flags on a payment or booking (strings in `flags` / `payment_flags`), shown to the admin and owner as chips:

| Flag | When | Effect |
|---|---|---|
| `duplicate_reference` | same normalized reference on another non-rejected payment of the same owner | **blocked at insert** (`REFERENCE_ALREADY_USED`) |
| `duplicate_proof` | same SHA-256 as another non-rejected proof | warning, admin digest alert |
| `repeat_rejections` | customer has 2 or more rejected proofs in 24 h | admin sees it; customer limited to 3 proof attempts per booking |
| `late_proof` | proof submitted in the last 10 minutes of the window | informational |
| `owner_credit_short` | see 2.4 | warning to owner and admin |
| `owner_no_response` | review window passed with no action | admin alert |
| `admin_confirmed` | confirmed through the admin path | informational |

### 2.8 Notifications (use `notify()` / `notify_admins()` and `admin_alert()`)

| Event | To | Channels |
|---|---|---|
| Proof submitted | owner | in-app, push, email: *"Check your wallet for ₱X, ref ...; confirm within 12 hours"* |
| Reminder 1 h, 4 h | owner | in-app, push (email at 4 h) |
| 8 h without action | admin | admin alert (instant) |
| Confirmed | customer | in-app, email with receipt link |
| Rejected | customer | in-app, push, email with the reason and whether time remains |
| `credits_low`, `credits_empty`, `CREDITS_SHORT` | owner (+ admin for `CREDITS_SHORT`) | in-app, email |
| Refund owed, due soon, overdue | owner; overdue also admin | in-app, email |
| Refund sent, not received | customer; admin on dispute | in-app, email |
| Dispute opened or resolved | owner, customer, admin | in-app, email |

Dedupe every reminder per booking and kind. **No notification body contains a reference number, account name or amount beyond what the recipient needs;** never include proof image links in email or push.

## 3. Receipt (Booking Payment Confirmation)

Generated only when a payment becomes `verified` (owner or admin attestation recorded).

```sql
create sequence public.receipt_seq;
create table public.payment_receipts (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid not null unique references public.payments(id),
  booking_id uuid not null references public.bookings(id),
  receipt_no text not null unique,                -- 'KB-' || to_char(now(),'YYYY') || '-' || lpad(nextval('public.receipt_seq')::text, 6, '0')
  public_code text not null unique,               -- 12+ char random, not guessable (gen_random_bytes), used in the verify URL
  status text not null default 'valid' check (status in ('valid','voided','refunded')),
  created_at timestamptz not null default now()
);
```

- Verification page `/receipt/[publicCode]` (public, no login): shows only receipt number, status (*Valid / Voided / Refunded*), paid amount, date, vehicle name, and owner business name. No customer details, no references, no account names. Rate limit and `noindex`.
- Receipt content for the customer (booking page and PDF at `/api/receipts/[id]/pdf`, owner-and-customer only): receipt number, booking reference, vehicle and dates, mode (self-drive or with driver), pickup place, **Reservation deposit paid**, **Balance due at pickup**, **Safety deposit** (self-drive only, from the booking's `deposit_amount`, labelled *"Held by the owner and refundable after the vehicle is returned in good condition. Not part of this online payment."*), owner business name, customer name, payment channel label (from `payment_method_label`), confirmed date and time (Asia/Manila), and the footer *"This is a payment confirmation for your booking, not an official tax receipt."* Do **not** use the words "Official Receipt" anywhere.
- When a booking is cancelled or refunded, set the receipt `voided` or `refunded`; never delete. Email the receipt link with Resend after confirmation (template variables, no attachment needed).

## 4. Payment page (customer UI)

Update `app/account/bookings/[id]/pay/page.tsx` (and its component):
- Big **amount to send now**, with **Copy amount**; **booking reference** with **Copy reference**; **Download QR** button; **account name** (with *"Check that the name matches before sending"*); balance at pickup; pay-before time (Asia/Manila); safety deposit note for self-drive.
- Step list: open e-wallet or bank app, Pay QR, scan or upload the saved image, check the name, type the exact amount, come back and upload the proof with the wallet **transaction reference**.
- Proof form: amount is prefilled and locked to `amount_due_now`; reference input with inline format hint and helper image; file upload (image only, max 5 MB, WebP conversion as elsewhere); loading and error states with the stable codes (`REFERENCE_ALREADY_USED`, `REFERENCE_INVALID`, `PAYMENT_WINDOW_EXPIRED`, `PROOF_LIMIT`).
- After submit: status card *"The owner is checking your payment. You will get an email and notification. Review deadline: {review_due_at}"*, plus **I paid but it is not confirmed** after 2 hours (opens the dispute dialog).
- Mobile first (390 px), no horizontal scroll, large touch targets; works with the SweetAlert helpers and AutoAnimate lists where applicable.
- Reference design mock: `sample-payment-page.png` (sent in chat). The QR in that mock is a placeholder; real QR images stay owner-uploaded.

## 5. Owner UI

- **`components/owner/payment-review.tsx`:** each pending payment shows the proof (signed URL, short expiry), amount, reference, deadline countdown, risk chips, and the **attestation form** (received amount and reference). Buttons **Confirm payment** (disabled until both fields match) and **Reject** (reason required, quick reasons: *Amount not received, Different amount, Wrong account, Unclear proof*). SweetAlert confirm before both.
- **Credits banner** on `/owner` and `/owner/credits`: balance, pending fees, available, low-balance warning, **Top up** button.
- **Refunds tab** under `/owner/payments`: list of owed refunds with due dates, **Mark refunded** (reference + proof upload).
- **Disputes:** read-only list with the customer's message and a **Reply** note (optional, 300 chars) that admin can see.
- Performance card: median confirmation time and counts (from `owner_payment_stats`), with a helper *"Fast confirmations get more bookings"* (no ranking logic in this spec).

## 6. Admin UI

- **`/admin/payments`:** add tabs **Needs review, Risk flags, Disputes, Refunds, Overdue**, risk chips, filters by owner and age, **Confirm on behalf of owner** (note required), **Resolve dispute** (resolution required), **Mark refund waived** (reason required). Show proof duplicates side by side.
- **Settings (`/admin/settings`):** `payment_window_hours`, `payment_review_hours`, `payment_resubmit_grace_hours`, `refund_due_days`, `credit_low_threshold` with validation ranges and audit logging.
- **Overview card:** *Payments waiting: n · Disputes open: n · Refunds overdue: n*; add these to the daily digest "Waiting for you" (admin alerts spec).
- All admin overrides and settings changes are written to the audit log with reasons.

## 7. Platform-fee leakage (light measures only)

- Show the owner's contact details and exact pickup instructions to the customer **after** payment confirmation, not before (verify the current behavior first; keep it if already so).
- Terms and owner agreement (`app/terms`): bookings started through Kuyog Bohol carry the platform fee for the whole rental, and owners must not ask customers to pay outside the platform for the same booking. State it clearly; do not build surveillance.
- Reviews (ratings spec) reward owners who keep bookings on the platform; the fee is cheaper than the cost of bad reviews.

## 8. Security and privacy

- All writes through definer RPCs with explicit permission checks; unique constraints enforce duplicates at the database, not only in the UI.
- `anon` has no EXECUTE on any new function; trigger-only functions are not granted to clients; new tables have RLS with owner, customer and admin policies only for what each role needs (customers: own payments and refunds and disputes; owners: their bookings' rows; admins: all).
- Proof images stay in the private bucket with the existing path rule `<customer_id>/<booking_id>/...`; signed URLs expire in minutes; the fingerprint route authenticates the caller and never returns the image.
- Never store raw IPs; if `confirmed_ip_hash` is kept, hash with a server secret and treat it as optional.
- Receipts and the public verify page reveal only minimal fields; codes are random and unguessable; rate limit the verify route.
- Emails and push messages carry no proof links, no account names, and no wallet references.
- Admin overrides always require a reason and are audit logged; admins cannot edit past attestations.

## 9. Test plan

SQL (switch roles with JWT claims):
1. Customer submits proof at 23 h of a 24 h window; owner has 12 h: booking is **not** expired at hour 24, `confirm_booking_payment` succeeds at hour 30, fails after `review_due_at`.
2. Proof rejected then resubmitted within the grace period works; after grace it fails.
3. Duplicate normalized reference for the same owner is rejected (`REFERENCE_ALREADY_USED`); the same reference for another owner is allowed; a rejected payment's reference can be reused.
4. Confirm with wrong amount or reference → `ATTESTATION_MISMATCH`; correct values succeed and are stored; admin without a note is rejected, with a note succeeds and sets `admin_confirmed` and notifies the owner.
5. Credits: owner with credits for one booking cannot accept a second pending booking (`owner_can_accept` uses available credits); a shortage at confirm time sets `owner_credit_short`, extends once, returns `CREDITS_SHORT`, and an admin override is audit logged.
6. Cancel and expiry paths create exactly one `booking_refunds` row; marking refunded without reference or proof is rejected; **Not received** moves it to `disputed`; overdue refunds notify the owner and admin once per day.
7. Customer can open a dispute only on their own booking, once per kind while open; non-admins cannot resolve; opening one extends the review window once.
8. Receipt is created only on verification, numbers are unique and increasing, voided on cancellation, public verify shows only the allowed fields.
9. Cross-role checks: a customer cannot read another customer's payments, an owner cannot confirm another owner's payment, `anon` cannot call any new RPC.
10. Existing flows (booking creation, owner status workflow, top-ups, invoices, `owner_mark_payment_received`) still pass.

App and integration:
- Fingerprint route: wrong owner → 403; same image on another booking adds `duplicate_proof` flags and an admin alert; a re-run is idempotent; rate limited.
- Payment page: copy buttons, QR download, locked amount, reference validation, mobile layout at 390 px, status card after submit, dispute dialog timing.
- Owner screen: attestation gating, risk chips, countdown, refunds tab with proof upload.
- Admin screen: tabs, overrides need reasons, settings validation, digest numbers match.
- Notifications fire once (dedupe) and contain no sensitive values; reminders stop after action.
- XSS: reference, notes and dispute text containing `<script>` render as plain text.
- `npm run lint`, `npx tsc --noEmit`, `npm run build`.

## 10. Build order (one commit per step)

1. Migration part 1: review window, `owner_id` on `payments`, unique reference, attestation fields and the new `confirm_booking_payment`; update all callers; tests 1 to 4 and 9.
2. Owner and admin confirm UI with attestation; payment page improvements (copy buttons, locked amount, reference validation, status card).
3. Fingerprint route and duplicate flags; admin Risk flags tab.
4. Credits: `owner_credit_state`, `owner_can_accept` change, low-balance notices, `CREDITS_SHORT` handling; test 5.
5. Refunds table and RPC changes; owner Refunds tab; customer status; reminders; test 6.
6. Disputes table, customer dialog, admin Disputes tab; test 7.
7. Receipts and the public verify page, PDF, email; test 8.
8. Owner performance events and stats view; settings page fields; digest additions; final security pass, accessibility, mobile and loading states; test 10.

## 11. Acceptance checklist

- [ ] A customer who submits proof before the deadline cannot lose the booking because the owner was slow (review window works and is configurable).
- [ ] Owners must attest the received amount and reference; admins can confirm on their behalf only with a reason.
- [ ] Reusing a reference is blocked per owner; reused proof images are flagged for admin review.
- [ ] A credit shortage never silently kills a paid booking; owners are warned before it happens and cannot over-accept pending bookings.
- [ ] Every refund is tracked with due date, reference and proof, reminders run, and the customer can say "not received".
- [ ] Customers can open a payment dispute; admins can resolve it with a recorded reason.
- [ ] Customers get a payment confirmation (not an "Official Receipt") with a public verification page that exposes only minimal fields.
- [ ] Admin sees risk flags, overdue confirmations, disputes and overdue refunds in one place and in the daily digest.
- [ ] No new anonymous EXECUTE; RLS covers every new table; no sensitive data in emails or push messages.
- [ ] Existing booking, credits, invoice and top-up flows keep working; lint, typecheck, build and tests pass.

## 12. Codex prompt

*"Implement QR payment hardening following `kuyog-bohol-qr-payment-hardening.md`. First read `supabase/migrations/202611060003_payment_qr_module.sql` (booking payment trigger, `confirm_booking_payment`, `reject_booking_payment`, `cancel_booking`, `expire_unpaid_bookings`, `owner_can_accept`), the payments, owner and admin payment components, and the pay page, and follow the existing patterns (read the Next.js 16 docs in `node_modules/next/dist/docs/` first). Build in the order of section 10, one commit per step. Keep the money model unchanged (owner receives the customer's payment directly; platform fee through credits or invoices). Fix the review-window and credit-shortage problems first. Use security definer functions with `set search_path = ''`, revoke from `anon` explicitly, enforce uniqueness in the database, never trust a client-supplied hash, and never put proof links, account names or references in emails or push messages. Do not use the words 'Official Receipt'. Run lint, typecheck, build and the SQL tests, and list anything you could not verify."*
