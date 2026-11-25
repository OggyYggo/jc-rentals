# Kuyog Bohol — Booking Abuse Protection (Customer Strikes, Hold Limits, Pauses, Appeals) — Implementation Spec for Codex

**Repo:** `OggyYggo/jc-rentals` (Next.js 16 App Router, React 19, TypeScript, Tailwind 4, shadcn/ui, Supabase Postgres + RLS, Vercel).
**Goal:** stop customers from abusing the booking flow (holding car dates without paying, repeated cancellations, no-shows, fake proofs) with **graduated, fair, reversible** rules: hold limits, a strike record, automatic short booking pauses, admin suspension, appeals, and clear warnings. No instant permanent bans, no hidden automatic punishment.
**Related specs:** `kuyog-bohol-qr-payment-hardening.md` (review window, refunds), `kuyog-bohol-pickup-pass-qr.md` (no-show vs pass), `kuyog-bohol-testing-fixes-plan.md` (cancellation policy dialog, friendly errors), `kuyog-bohol-audit-log.md`, `kuyog-bohol-admin-email-alerts.md`, `kuyog-bohol-sweetalert.md`, `kuyog-bohol-user-onboarding.md`.

> Next.js 16 here has breaking changes. Read the relevant guide in `node_modules/next/dist/docs/` before writing routes, server actions or caching code, and follow the repo's patterns.
> Other specs may already have changed `cancel_booking`, `expire_unpaid_bookings`, the payment statuses and the booking page. **Re-read those before editing** and adapt this spec to what exists.

---

## 0. What exists today (read in the repo, Nov 18 snapshot)

- **No abuse controls:** no limit on active or unpaid bookings, no strike or cancellation counter, no way to suspend or pause a customer. (`car_blocked_dates` are owner calendar blocks, unrelated.)
- **Booking creation:** the `book` server action in `app/cars/[id]/page.tsx` inserts into `public.bookings`. Existing `before insert` triggers: `assign_booking_owner_and_earnings` and `expire_booking_holds_before_insert` (releases expired holds), plus an overlap exclusion constraint on active bookings. New bookings start as `awaiting_payment` with `payment_due_at` (default 24 h).
- **Holds:** an `awaiting_payment` booking blocks the car's dates until `payment_due_at`; `expire_unpaid_bookings()` (pg_cron every 10 minutes) then sets `expired`.
- **Cancellation:** a single function `public.cancel_booking(p_booking_id, p_reason)` is used by the customer (only before the start date), the owner and admins. It allows `awaiting_payment`, `payment_review`, `confirmed`, writes `cancel_reason` (free text, max 500) and sets `deposit_refund_status = 'owed'` when money was paid. **Nothing records who cancelled or why in a structured way.**
- Booking statuses: `awaiting_payment, payment_review, pending, confirmed, picked_up, returned, completed, cancelled, rejected, expired`.
- Customer profile (`profiles`) has `verification` (`none, pending, approved, rejected`); customer documents are private.
- Notifications: `notify()` / `notify_admins()`; admin email alerts spec defines `admin_alert(...)`; audit log spec defines `audit_write(...)`.
- All definer functions in the payment module use `security definer` and `set search_path = ''`; follow that.

## 1. Principles (do not break these)

1. **Fair and explainable:** every restriction has a reason shown to the customer, a start and end, and an appeal path.
2. **Graduated:** warning → short pause → longer pause → admin-decided suspension. Only admins can suspend.
3. **No punishment for things that are not the customer's fault:** owner cancellations, owner rejections, owner not responding after the customer submitted proof, admin cancellations, system errors.
4. **Existing paid and confirmed bookings are never cancelled by a restriction.** Restrictions only block **new** bookings.
5. **Strikes expire** (default 90 days) and admins can waive them.
6. **Private:** only admins see the full record. Owners never see a customer's strikes or restrictions.
7. **Data minimization:** no new personal data is collected; events hold booking ids, a kind, points and short notes. Retention in section 8.
8. **Policy transparency:** the rules appear in the Terms and in the cancellation policy dialog (version bump).
9. **Configurable:** all thresholds are admin settings with safe ranges; the whole system has an on and off switch.
10. **Deposit forfeiture is out of scope for v1** (business and legal decision for Jabez; see section 11). v1 only records events and limits new bookings.

## 2. Rules (defaults, all editable in admin settings)

### 2.1 Hold limits (prevents date squatting)

| Rule | Default | Range |
|---|---|---|
| Max **unpaid** bookings at once (status `awaiting_payment`, not expired) per customer | **2** | 1 to 5 |
| Max unpaid bookings per **vehicle** per customer | **1** | 1 to 2 |
| Max bookings **created** by one customer per day | **6** | 3 to 20 |

Bookings that already have a pending or verified proof (`payment_review`, `confirmed`, and so on) do **not** count as unpaid holds.

### 2.2 Strike events and points

| Event kind | When it is recorded | Points | Source |
|---|---|---|---|
| `unpaid_expired` | A booking expires while `awaiting_payment` and the customer **never submitted a proof** (no `pending` or `verified` payment ever existed) | 1 | system |
| `cancelled_unpaid` | Customer cancels in `awaiting_payment` | 0 (counted for statistics only) | system |
| `cancelled_after_payment` | Customer cancels in `payment_review` or `confirmed` **more than** `risk_late_cancel_hours` (default 24 h) before the start | 1 | system |
| `late_cancel` | Customer cancels within `risk_late_cancel_hours` of the start | 2 | system |
| `no_show` | Owner reports a no-show (section 4.3) | 3, flagged `needs_review` | owner |
| `fake_proof` | Admin marks a payment proof as fake or reused (hardening spec flags help) | 3 | admin |
| `owner_report` | Owner reports abusive behavior | 0 until admin sets points | owner |
| `admin_strike` | Admin adds a strike manually (reason required) | 1 to 5 | admin |
| `admin_note` | Internal note, no points | 0 | admin |

Not counted at all: owner or admin cancellations, owner rejections, a booking that expired in `payment_review` because the owner did not act, bookings cancelled because the vehicle became unavailable, anything with `cancelled_by_role <> 'customer'` except `no_show`.

An event is **active** while `expires_at > now()` (default `created_at + 90 days`) and it is not waived.

### 2.3 Automatic escalation (booking pause)

After each new event, `evaluate_customer_risk(customer_id)` runs:
1. Warning: when active points in the last 30 days reach **2**, send the customer a warning notification (once per 30 days) and an `admin_alert` digest item.
2. **Pause:** when active points in the last 30 days reach **3**, and there is no active restriction, create a `booking_pause` for **7 days** (first pause in 180 days), **30 days** (second pause in 180 days). A third pause in 180 days also creates a 30-day pause **and** raises an admin alert (instant) asking for a suspension decision.
3. Suspension (`suspended`) is **never automatic**: only an admin can set it, with a reason.

A pause blocks creating new bookings only. The customer can still log in, view bookings, pay or cancel existing ones, use the pickup pass and review trips.

### 2.4 Defaults for settings (keys in `public.settings`, values jsonb; validated in the admin action)

`risk_enabled` true, `risk_max_unpaid_holds` 2, `risk_max_unpaid_per_car` 1, `risk_max_bookings_per_day` 6, `risk_late_cancel_hours` 24 [2 to 72], `risk_strike_days` 90 [30 to 365], `risk_warn_points` 2, `risk_pause_points` 3 [2 to 10], `risk_pause_days_1` 7, `risk_pause_days_2` 30 [1 to 90], `risk_no_show_wait_hours` 3 [1 to 12].

## 3. Database (migration `2026112200xx_booking_abuse_protection.sql`)

All new functions: `security definer`, `set search_path = ''`, schema-qualified names, `revoke all ... from public, anon, authenticated`, then grant only what is listed. Trigger functions get no client grants.

### 3.1 Structured cancellation data on `bookings`

```sql
alter table public.bookings
  add column if not exists cancelled_at timestamptz,
  add column if not exists cancelled_by uuid references public.profiles(id),
  add column if not exists cancelled_by_role text check (cancelled_by_role in ('customer','owner','admin','system')),
  add column if not exists cancel_kind text check (cancel_kind in
    ('unpaid_expired','customer','late_customer','owner','no_show','admin','system'));
```

- Backfill existing `cancelled` and `expired` rows: `cancelled_by_role` from `cancel_reason` text ('Cancelled by customer' → customer, else unknown → leave null), `expired` rows → `system` / `unpaid_expired`.
- **Replace `public.cancel_booking`** (keep every existing check and the refund logic exactly as currently in the repo after the hardening work; **re-read the live version first**) so it also sets: `cancelled_at = now()`, `cancelled_by = auth.uid()`, `cancelled_by_role` (customer, owner or admin based on who called), and `cancel_kind` (`customer`, or `late_customer` when the customer cancels a paid booking within `risk_late_cancel_hours` of the start; `owner`; `admin`).
- `expire_unpaid_bookings()` sets `cancelled_at = now()`, `cancelled_by_role = 'system'`, `cancel_kind = 'unpaid_expired'`.
- Column grants: these columns are written only by the definer functions; do not add them to the customer insert grant.

### 3.2 Tables

```sql
create table public.customer_risk_events (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.profiles(id) on delete cascade,
  booking_id uuid references public.bookings(id) on delete set null,
  kind text not null check (kind in ('unpaid_expired','cancelled_unpaid','cancelled_after_payment',
    'late_cancel','no_show','fake_proof','owner_report','admin_strike','admin_note')),
  points smallint not null default 0 check (points between 0 and 5),
  source text not null check (source in ('system','owner','admin')),
  reported_by uuid references public.profiles(id),
  note text check (note is null or char_length(note) <= 500),
  needs_review boolean not null default false,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  waived_at timestamptz,
  waived_by uuid references public.profiles(id),
  waive_reason text check (waive_reason is null or char_length(waive_reason) <= 300)
);
create index customer_risk_events_customer_idx on public.customer_risk_events (customer_id, created_at desc);
create index customer_risk_events_review_idx on public.customer_risk_events (needs_review) where needs_review;
-- one automatic event per booking and kind (idempotent triggers):
create unique index customer_risk_events_booking_kind on public.customer_risk_events (booking_id, kind)
  where booking_id is not null and source = 'system';

create table public.customer_restrictions (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null check (kind in ('booking_pause','suspended')),
  source text not null check (source in ('system','admin')),
  reason text not null check (char_length(reason) between 5 and 500),   -- plain language, shown to the customer
  starts_at timestamptz not null default now(),
  ends_at timestamptz,                                                   -- null only for 'suspended'
  status text not null default 'active' check (status in ('active','lifted','expired')),
  created_by uuid references public.profiles(id),
  lifted_by uuid references public.profiles(id),
  lifted_at timestamptz,
  lift_reason text check (lift_reason is null or char_length(lift_reason) <= 300),
  created_at timestamptz not null default now(),
  check (kind = 'suspended' or ends_at is not null)
);
create unique index customer_restrictions_one_active on public.customer_restrictions (customer_id) where status = 'active';

create table public.customer_appeals (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.profiles(id) on delete cascade,
  restriction_id uuid references public.customer_restrictions(id) on delete set null,
  event_id uuid references public.customer_risk_events(id) on delete set null,
  message text not null check (char_length(message) between 10 and 1000),
  status text not null default 'open' check (status in ('open','approved','rejected')),
  decision_note text check (decision_note is null or char_length(decision_note) <= 500),
  decided_by uuid references public.profiles(id),
  decided_at timestamptz,
  created_at timestamptz not null default now()
);
create unique index customer_appeals_one_open on public.customer_appeals (customer_id) where status = 'open';
```

RLS: enabled on all three; `revoke all ... from anon, authenticated`. Customers may **select** only through definer functions (3.5); admins `select` all through policies (`using (public.is_admin())`) and write only through RPCs.

### 3.3 Enforcement at booking creation

`before insert` trigger on `public.bookings`, function `public.enforce_customer_booking_limits()` (definer, no client grant). It must **not** depend on trigger order: count unpaid holds with `status = 'awaiting_payment' and payment_due_at > now()`.

Checks, only when `risk_enabled` and the insert is made by the customer (`new.customer_id = auth.uid()`; service role and admin inserts are not limited):
1. Active restriction for `new.customer_id` (status `active`, `ends_at is null or ends_at > now()`) → raise with the stable code and a safe sentence: `ACCOUNT_SUSPENDED` or `BOOKING_PAUSED` (include the end date in the message as ISO date; the app formats it).
2. Unpaid holds of this customer `>= risk_max_unpaid_holds` → `TOO_MANY_UNPAID_HOLDS`.
3. Unpaid holds of this customer on the same car `>= risk_max_unpaid_per_car` → `ONE_HOLD_PER_VEHICLE`.
4. Bookings created by this customer in the last 24 hours `>= risk_max_bookings_per_day` → `DAILY_BOOKING_LIMIT`.

Use `raise exception using errcode = 'P0001', message = 'BOOKING_PAUSED:2026-12-01'` style messages so the app can map codes without parsing prose; document the format in code comments.

### 3.4 Recording events (triggers, idempotent)

`after update of status on public.bookings` trigger `record_booking_risk_events()` (definer):
- `new.status = 'expired'` and `old.status = 'awaiting_payment'` and **no** `payments` row with `status in ('pending','verified')` exists for the booking → `unpaid_expired` (1 point).
- `new.status = 'cancelled'` and `new.cancelled_by_role = 'customer'`:
  - `old.status = 'awaiting_payment'` → `cancelled_unpaid` (0 points);
  - `old.status in ('payment_review','confirmed')` → `late_cancel` (2) when `new.cancel_kind = 'late_customer'`, else `cancelled_after_payment` (1).
- Never record anything for `cancelled_by_role` other than `customer` (except `no_show`, section 4.3).
Insert with `expires_at = now() + (risk_strike_days || ' days')::interval`; `on conflict do nothing` (unique index above). After inserting, call `evaluate_customer_risk(customer_id)`.

`public.evaluate_customer_risk(p_customer uuid)` (definer, internal): computes active points in the last 30 days (not waived, not expired); applies section 2.3 (warning notification, pause creation with `source = 'system'` and a plain reason such as *"Several bookings were not paid or were cancelled recently. You can book again on {date}."*, admin alert). Escalation counts previous system pauses in the last 180 days. It must be safe to run twice (no duplicate restriction thanks to `customer_restrictions_one_active`, warnings deduped per customer per 30 days).

Cron `expire_customer_restrictions()` hourly: sets `status = 'expired'` where `ends_at <= now()` and notifies the customer once (*"You can book again."*).

### 3.5 Customer-facing functions

```sql
create function public.get_my_booking_eligibility() returns jsonb ...
```
Definer, authenticated only. Returns `{ can_book, code, until, unpaid_holds, max_unpaid_holds, warn }` where `code` is null or one of the stable codes. Used by the booking page to show an explanation **before** the customer fills the form. It never returns strike details beyond what the customer needs.

```sql
create function public.get_my_risk_summary() returns jsonb ...
```
Returns the customer's own active restriction (reason, until), recent active events (kind label, date, points) and the open appeal status, so the customer sees exactly why. No owner names, no notes written by owners or admins (only the plain-language `reason`).

```sql
create function public.open_my_appeal(p_restriction uuid default null, p_event uuid default null, p_message text) returns uuid ...
```
Customer only, one open appeal at a time (unique index), message 10 to 1000 chars, rate limited (3 per day). Notifies admins (`notify_admins` + `admin_alert('risk.appeal', ...)` Instant). Never include the message in notifications.

### 3.6 Owner function: report no-show and problems

```sql
create function public.owner_report_no_show(p_booking uuid, p_note text default null) returns void ...
```
Definer; caller owns the booking (or admin). Allowed only when: status `confirmed`, the booking's pickup pass (pickup pass spec) is not `used`, and `now()` in Manila is at least `start_date + coalesce(pickup_time,'12:00') + risk_no_show_wait_hours`. Effects, in one transaction with `for update`: booking becomes `cancelled` with `cancelled_by_role = 'owner'`, `cancel_kind = 'no_show'`, `cancelled_at`; refund bookkeeping follows the **existing** cancellation logic (do not change deposit rules in v1; the deposit refund status stays as today and is decided by policy and admin); the pass is revoked; a `no_show` event is inserted with `source = 'owner'`, `reported_by`, `points = 3`, `needs_review = true`; notify the customer (*"The owner reported that you did not pick up your booking. If this is a mistake, you can appeal in your account."*) and `admin_alert('risk.no_show', ...)` as **Digest**. One report per booking; limit of 5 reports per owner per week (`NO_SHOW_LIMIT`).

```sql
create function public.owner_report_customer(p_booking uuid, p_note text) returns void ...
```
Owner reports abusive behavior (note 10 to 500 chars) → `owner_report` event, 0 points, `needs_review = true`; never changes the booking. Limit 3 per owner per week.

### 3.7 Admin functions (all `is_admin()` checked inside, all call `audit_write`, reasons mandatory)

- `admin_add_risk_event(p_customer, p_kind, p_points, p_note)` (`admin_strike`, `admin_note`, `fake_proof`; note required for strikes).
- `admin_review_risk_event(p_event, p_action, p_points, p_note)`: `confirm` (clears `needs_review`), `waive` (sets `waived_at`, `waive_reason` required), or `set_points` (for `owner_report`).
- `admin_restrict_customer(p_customer, p_kind, p_days, p_reason)`: `booking_pause` (1 to 90 days) or `suspended` (no end date); `p_reason` is shown to the customer, so it must be plain and neutral; replaces any active restriction (lifts the old one with a note).
- `admin_lift_restriction(p_restriction, p_reason)`.
- `admin_decide_appeal(p_appeal, p_approve, p_note)`: approve → waives the linked event and lifts the linked restriction (if any); both outcomes notify the customer with the decision note (plain text).
- `admin_customer_risk_summary(p_customer)` returns points (30 days, 90 days), counts by kind, active restriction, open appeal, previous pauses, and a **soft signal** `possible_duplicate_of_restricted` (same normalized phone as another customer with an active or recent restriction; admin-only hint, never auto-blocks; use the existing phone column and confirm its name in the schema).

## 4. App changes

### 4.1 Booking page (`app/cars/[id]/page.tsx`) and the `book` server action

- On load, call `get_my_booking_eligibility()` (for signed-in customers). If `can_book` is false, show a clear panel above the form and disable the request buttons:
  - `BOOKING_PAUSED`: *"Booking is paused until {date}. This happens when several bookings were not paid or were cancelled in a short time. Your existing bookings are not affected. See details or appeal in your account."*
  - `ACCOUNT_SUSPENDED`: *"Your account cannot make new bookings. Contact Kuyog Bohol support to review this."*
  - `TOO_MANY_UNPAID_HOLDS`: *"You already have {n} unpaid bookings. Pay or cancel one to book another."* with a link to My bookings.
  - `ONE_HOLD_PER_VEHICLE`, `DAILY_BOOKING_LIMIT`: matching short messages.
  When `warn` is true show a gentle notice *"Repeated unpaid bookings or late cancellations can pause your booking access."*
- The `book` action maps the database codes (section 3.3) to the same friendly messages (extend the existing `bookingError` mapping) because the trigger is the real enforcement; the UI check is only a courtesy.
- Add one line to the cancellation policy dialog (`lib/policies/cancellation.ts`, bump the version): *"Repeated unpaid bookings, late cancellations or no-shows may temporarily pause your ability to book."* Link to the Terms section.

### 4.2 Customer account

- **My bookings:** when cancelling a paid booking, the confirm dialog (SweetAlert helper if available) states the consequence before confirming: *"Cancelling this paid booking {more than / less than} 24 hours before pickup. {Late cancellations count toward your booking record.} Refunds follow the cancellation policy."* Show the cancelled-by and reason on cancelled bookings (from the new columns).
- **Account → Booking record** (new section on `/account`, or `/account/record`): shows the active restriction (reason, until date), active events with plain labels (*Unpaid booking expired*, *Late cancellation*, *Reported no-show*), when each expires, the open appeal and its status, and an **Appeal** button (dialog with a message field and a clear promise that an admin will review it). Use `get_my_risk_summary()`.
- Notifications (in-app and email; never include other people's names, owner notes or codes): `risk_warning`, `risk_paused`, `risk_lifted`, `risk_appeal_decided`, `risk_no_show_reported`.

### 4.3 Owner UI

- On `/owner/bookings` for `confirmed` bookings past the allowed time, show **Report no-show** (dialog with the explanation *"Only report this if the customer did not arrive and did not contact you. The booking will be cancelled and Kuyog Bohol will review it."* and a note field). If the pickup pass is already used, the button is hidden.
- **Report a problem with this customer** (secondary action in the booking menu): short form (note required).
- Owners see only the result of their own report (*"Reported. Kuyog Bohol will review."*), never the customer's strikes or restrictions.
- Optional: on booking requests show the existing verification badge only; no risk indicator.

### 4.4 Admin UI

- **`/admin/risk`** (add to the admin nav with a badge for items needing review): tabs **Needs review** (no-show reports, owner reports, open appeals, new automatic pauses), **Active restrictions**, **Recent events**. Row actions open the customer's risk drawer.
- **Customer risk drawer** (also reachable from `/admin/customers` through a *Risk* chip and a **Booking record** button): points (30 and 90 days), timeline of events with source and notes, restrictions, appeal thread, soft signals, and actions **Add strike**, **Add note**, **Waive event**, **Pause bookings**, **Suspend**, **Lift restriction**, **Decide appeal** (all need a reason; destructive ones use the confirm dialog). Shows the related bookings and the payment flags from the hardening spec.
- **Settings** (`/admin/settings`): section **Booking protection** with all keys in 2.4, validation ranges, an on/off switch, and a preview text of the resulting rules. Every change is audit logged.
- **Dashboard card:** *Booking record: n need review · m restricted* (clickable link to `/admin/risk`).
- **Admin alerts** (admin email alerts spec): `risk.pause_created` (Digest), `risk.third_pause` (Instant), `risk.no_show` (Digest), `risk.appeal` (Instant), `risk.owner_report` (Digest).
- **Owner cancellation visibility (small, v1):** on the owner detail page show cancellations by this owner in the last 90 days (from `cancelled_by_role = 'owner'`) and add an admin alert `risk.owner_cancellations` (Digest) when an owner has 3 or more in 30 days. No automatic owner penalties in v1.

## 5. Security and privacy

- Enforcement is in the **database** (trigger), not only in the UI; the UI check only explains it.
- Customers cannot insert, update or delete any risk table; they read only their own summary through definer functions; owners can write only the two report functions, scoped to their own bookings; admins use RPCs with reasons and audit logging.
- No restriction can be created by an owner or by the client; automatic pauses come only from `evaluate_customer_risk`.
- Admin-written notes are never returned to the customer; only the plain-language `reason` and the decision note are.
- Notifications and emails carry no strike details beyond a generic message and a link to the account page.
- Retention: delete or anonymize risk events and appeals older than **12 months** (cron monthly, `customer_id` kept only if an active restriction exists); suspended customers' records follow the admin's retention decision. Document this in the privacy policy.
- Data Privacy Act: keep the purpose limited to preventing booking abuse, disclose it in the Terms and privacy policy, keep human review for suspensions and for owner-reported no-shows, keep the appeal path. The soft duplicate-phone signal is admin-only and never an automatic decision; check with a privacy adviser before using any additional identity matching.
- Rate limits on owner reports and customer appeals; all functions revoke `anon`; `search_path = ''`; RLS on every new table.
- Failure of the risk system must **never** block normal bookings by accident: the enforcement trigger checks `risk_enabled`; if the settings read fails it falls back to the safe defaults, and errors in `record_booking_risk_events` are caught and logged (`raise warning`) rather than blocking a cancellation or expiry.

## 6. Test plan

SQL (switch roles with JWT claims):
1. Hold limits: a customer with 2 unpaid (`awaiting_payment`, not expired) bookings cannot create a third (`TOO_MANY_UNPAID_HOLDS`); expired holds and bookings in `payment_review` do not count; a second unpaid booking on the same car fails (`ONE_HOLD_PER_VEHICLE`); daily limit works; admin and service-role inserts are not limited; `risk_enabled = false` disables checks.
2. Strike recording: expiry without any proof → `unpaid_expired` (1 point); expiry **after a pending proof** (owner did not act) → no event; customer cancels unpaid → 0 points; cancels paid more than 24 h before start → 1 point; within 24 h → 2 points; owner or admin cancels → no event; running the triggers twice does not duplicate events.
3. Escalation: 2 points in 30 days sends one warning; 3 points creates a 7-day `booking_pause`; the next booking insert fails with `BOOKING_PAUSED:{date}`; existing confirmed bookings still work (pay, cancel, pass, review); a second pause within 180 days is 30 days; a third raises the admin alert; strikes older than 30 days do not count toward a pause; expired strikes are inactive.
4. Restrictions: only one active per customer; `suspended` has no end date and can only be created by an admin; lifting works; the hourly job expires pauses and notifies once.
5. No-show: only the booking's owner, only after the wait time, only for `confirmed` bookings with an unused pass; creates one event with `needs_review`; booking is cancelled with `cancel_kind = 'no_show'`; second report fails; weekly limit enforced; refund bookkeeping unchanged from today's cancellation behavior.
6. Appeals: one open at a time; approve waives the event and lifts the linked restriction; reject keeps them; customers cannot read admin notes.
7. Permissions: a customer cannot read another customer's record or call admin or owner functions; an owner cannot read any risk table; `anon` cannot execute anything new; all admin actions write audit entries and require reasons.
8. Existing flows unchanged: booking creation, payment proof, confirmation, review window, pickup pass, refunds, expiry cron, notifications.

App:
- Booking page shows the right panel for each code and disables the buttons; the `book` action shows friendly messages for every code; copy is correct in English (and Bisaya if the app is bilingual).
- Account **Booking record** shows restriction, events with expiry dates, and appeal flow; cancel dialog shows the consequence text with the right time wording.
- Owner **Report no-show** appears only when allowed and explains the effect; **Report a problem** works; owners never see strikes.
- Admin risk queue, customer drawer actions (each requiring a reason), settings validation, dashboard card link, audit log entries.
- Notifications contain no sensitive details; mobile layouts at 390 px; keyboard and screen reader checks.
- `npm run lint`, `npx tsc --noEmit`, `npm run build`.

## 7. Build order (one commit per step)

1. Migration part 1: structured cancellation columns and backfill, updated `cancel_booking` and `expire_unpaid_bookings`, settings, tables and RLS; SQL tests 1 (limits only after step 2) and 4 setup.
2. Enforcement trigger and `get_my_booking_eligibility`; booking page panel and friendly error mapping; tests 1 and 7 (partial).
3. Event recording triggers, `evaluate_customer_risk`, restriction expiry cron, notifications; tests 2 and 3.
4. Customer **Booking record** page, appeal function and dialog, cancel-dialog consequence text, policy version bump and Terms text; test 6 (customer side).
5. Owner no-show and problem reports; test 5.
6. Admin: `/admin/risk`, customer risk drawer, admin RPCs with audit logging, settings section, dashboard card, admin alerts; tests 6 (admin side) and 7.
7. Retention job, owner-cancellation visibility, final security pass, accessibility, mobile checks, loading and error states.

## 8. Acceptance checklist

- [ ] A customer cannot hold more than the allowed number of unpaid bookings; limits are enforced in the database and explained in the UI before and after clicking.
- [ ] Unpaid expiries, late cancellations and no-shows create strikes; owner and system causes never do; strikes expire and can be waived.
- [ ] 3 active points in 30 days pause new bookings for 7 days (then 30), with a clear reason and end date; existing bookings are untouched; suspension is admin-only.
- [ ] Customers can see why they are restricted, when it ends, and can appeal; admins can decide appeals; every admin action needs a reason and is audit logged.
- [ ] Owners can report a no-show (rules enforced, booking cancelled, admin review) and report a problem; owners never see a customer's record.
- [ ] Policy text and Terms mention the rules; the cancel dialog states the consequence honestly.
- [ ] No sensitive data in notifications; retention job exists; no new anonymous EXECUTE; RLS on every new table.
- [ ] The risk system can be switched off in settings and never blocks normal bookings by error.
- [ ] Lint, typecheck, build and all tests pass.

## 9. Open decisions for Jabez (the app works with the defaults; change them in settings)

1. **Deposit forfeiture:** should an owner keep part or all of the reservation deposit after a late cancellation or no-show? Not built in v1; it needs written policy wording (and possibly DTI or legal advice) and then a rule in the refund logic.
2. Are the defaults right: 2 unpaid bookings at once, 24-hour late-cancel window, 3 points in 30 days for a 7-day pause, strikes expire after 90 days?
3. Should owners see a simple "reliable customer" badge (for example 3 or more completed trips with no strikes) on booking requests? Not included in v1.
4. Who handles appeals and no-show reviews (you only, or support staff), and what is the target response time (suggested: 2 days)?

## 10. Codex prompt

*"Implement booking abuse protection following `kuyog-bohol-booking-abuse-protection.md`. First read `202611060003_payment_qr_module.sql` (`cancel_booking`, `expire_unpaid_bookings`, booking triggers) and the hardening and pickup pass work that may already have changed them, `app/cars/[id]/page.tsx`, `components/customer/booking-list.tsx`, `components/owner/booking-workflow.tsx` and the admin customers page, and follow the repo patterns (read the Next.js 16 docs in `node_modules/next/dist/docs/` first). Build in the order of section 7, one commit per step. Enforce limits in a database trigger that does not depend on trigger order, record structured cancellation data, make every automatic event idempotent, never count owner, admin or system-caused cancellations, never touch existing confirmed or paid bookings, and keep suspension admin-only. Use security definer functions with `set search_path = ''`, revoke from `anon` explicitly, require reasons for admin actions and write audit entries, and keep strike details out of notifications. Do not implement deposit forfeiture. Run lint, typecheck, build and the SQL tests, and list anything you could not verify."*
