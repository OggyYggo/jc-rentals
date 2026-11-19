# Kuyog Bohol — Pricing Page and Owner Plan System (Implementation Spec for Codex)

**Repo:** `OggyYggo/jc-rentals` (Next.js 16 App Router, React 19, TypeScript, Tailwind 4, shadcn/ui, Supabase, Resend, Vercel).
**Design source:** Claude Design canvas boards **Pricing: Desktop** (1440) and **Pricing: Mobile** (390), same blue style as Apply and Contact.
**Related specs:** `kuyog-bohol-contact-page-implementation.md`, `kuyog-bohol-gsap-animations.md`, `kuyog-bohol-security-audit-verified.md`.

**Goal:** owners pick a plan. The plan sets **how many active cars they can list**, **their commission rate**, and their **support level**. The limit is enforced **in the database**, not only in the UI. Plan fees are paid by **QR to the admin** and confirmed by the admin (no payment gateway, no business permit needed).

---

## 0. Read first: how the current code works (do not break it)

- `public.owners`: `id, profile_id, business_name, contact_phone, commission_rate (default 0.05), is_active, fee_mode ('credits'|'invoice'), deposit_percent, payment_qr_*`. A trigger (`reset_owner_payment_qr_verification`) blocks non-admins from changing `commission_rate`, `fee_mode`, `is_active` and others. **Read this trigger before writing any plan code** and make the plan functions pass it (see section 3.5).
- `public.cars`: `owner_id`, `is_active` (published and bookable), `short_code`, `allows_self_drive`, `allows_with_driver`. RLS lets owners **insert and update their own cars directly** from the browser, so the limit **must be a trigger**, not app code.
- Bookings **snapshot** `commission_rate`, `commission_amount`, `owner_earnings` on insert (`set_booking_owner_and_earnings`, reading `owners.commission_rate`). Changing a plan therefore never changes old bookings. Keep it that way.
- Commission collection (`owner_credit_ledger` prepaid credits or `commission_invoices`) stays exactly as is. **The plan fee is a separate monthly subscription** and is not mixed into the credit ledger.
- Admin pages exist: `/admin/owners`, `/admin/owners/[id]`, `/admin/fees`, `/admin/topups`, `/admin/settings`. Owner pages: `/owner`, `/owner/cars`, `/owner/credits`, `/owner/payment-settings`.
- Notifications: `public.notify(...)` and `public.notify_admins(...)` (definer, not callable by clients). Cron: `pg_cron` is used inside a guarded `do $$` block (see `expire_unpaid_bookings`). Follow the same pattern.
- Rules from the security audit apply to everything new: `security definer` + `set search_path = public`, **revoke EXECUTE from `public, anon, authenticated`** and grant only what is needed, column-level grants, RLS on every table, no secrets in code.

## 1. Plans (seed data, editable by admin)

| Code | Name | Price / month | Active cars | Commission | Support |
|---|---|---|---|---|---|
| `starter` | Starter | ₱0 | 3 | 5% | Email |
| `standard` | Standard | ₱499 | 10 | 3% | Priority email |
| `fleet` | Fleet | ₱1,499 | 30 | 2% | Priority + onboarding help |
| `custom` | Custom | set by admin | set by admin | set by admin | set by admin (not shown publicly) |

These numbers are **starting values**. They live in the database so the owner can change them without a deploy. Never hard-code prices, limits or rates in React or SQL logic.

Rules:
- "Active car" = `cars.is_active = true`. Drafts and hidden cars do not count.
- Break-even used on the pricing page is **computed** from the plan rows, not typed: Standard vs Starter = `price_standard / (rate_starter - rate_standard)`; Fleet vs Standard likewise. With seed values this gives about ₱25,000 and ₱100,000 per month.
- Customers never pay a booking fee. The pricing page says so.

## 2. Public pricing page `/pricing`

Server component. Reads `plans` where `is_public` ordered by `sort_order` (use `revalidate = 300` or tag-based revalidation when admin edits a plan). Layout follows the design boards:

1. **Header band** (blue `#0A47B1`, eyebrow *PRICING FOR CAR OWNERS*, H1 *Simple pricing. No surprises.*, sub text). Side padding 140px desktop, 20px mobile.
2. **Plan cards**: three cards overlapping the band by about 84px (desktop) / 56px (mobile). The plan with `is_featured` gets a 2px blue border, stronger shadow and the *MOST POPULAR* pill. Each card: name, tagline, price (`Free` when 0, else `₱499 / month`), a chip `5% commission · up to 3 cars`, divider, checklist, button. Wrappers need `position: relative` so they paint above the band.
3. **Comparison table** (desktop only): rows Price, Active cars, Commission, Owner dashboard and booking calendar, Promo kit with your own QR code, Support. Standard column tinted `#F3F9FF`. Below it the computed break-even sentence.
4. **How paying for a plan works** (3 steps) next to an **Example** card (3-day booking, ₱3,000 per day, Starter 5%, you keep ₱8,550). Compute the numbers from the Starter plan rate; do not hard-code.
5. **Pricing questions** (4 cards, 2 columns desktop, 1 mobile): what counts as an active car; what happens when a plan ends; changing plans; customers pay no extra.
6. **CTA band**: *Ready to list your car?* → **Apply to list your car**.

Buttons:
- Not signed in or customer: `/apply?plan={code}` (Starter button label *Start free*, others *Choose {Name}*).
- Signed-in owner: `/owner/plan?choose={code}`.
- Add a *Pricing* link to the footer, the **For owners** page and the Apply page (small text link *See pricing*).

Page metadata: title *Pricing for car owners | Kuyog Bohol*; description *List your car free. Pick a plan when you grow. Pay a small commission only when you get a booking.* Add to the sitemap. Tokens, fonts (Inter headings, Work Sans text), radii and colors match the existing pages. Use the GSAP spec only for light reveal effects (optional, last).

Optional: store the chosen plan on the application (`owner_applications.preferred_plan text`, validated against `plans.code`) so the admin sees what the applicant wanted. Approval still creates the owner on **Starter**.

## 3. Database (new migration `202611190001_owner_plans.sql`)

### 3.1 Tables

```sql
create table public.plans (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[a-z][a-z0-9_]{1,30}$'),
  name text not null check (char_length(name) between 2 and 40),
  tagline text,
  price_php numeric(10,2) not null default 0 check (price_php >= 0),
  max_active_cars int not null check (max_active_cars between 1 and 1000),
  commission_rate numeric(5,4) not null check (commission_rate between 0 and 0.5),
  support_level text not null default 'email' check (support_level in ('email','priority','priority_onboarding','custom')),
  features jsonb not null default '[]'::jsonb,   -- list of strings shown on the card
  is_public boolean not null default true,
  is_featured boolean not null default false,
  is_active boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.owner_plans (
  owner_id uuid primary key references public.owners(id) on delete cascade,
  plan_id uuid not null references public.plans(id),
  status text not null default 'active' check (status in ('active','expired')),
  started_at timestamptz not null default now(),
  expires_at timestamptz,                  -- null = never expires (Starter, Custom lifetime)
  car_limit_override int check (car_limit_override is null or car_limit_override between 1 and 1000),
  commission_override numeric(5,4) check (commission_override is null or commission_override between 0 and 0.5),
  reminder_stage int not null default 0,   -- 0 none, 1 sent 5-day, 2 sent 1-day, 3 expired notice
  updated_by uuid references public.profiles(id),
  updated_at timestamptz not null default now()
);

create table public.plan_payments (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.owners(id) on delete cascade,
  plan_id uuid not null references public.plans(id),
  amount numeric(10,2) not null check (amount > 0),      -- set by trigger from plans.price_php, never by client
  reference_no text not null check (char_length(reference_no) between 6 and 40),
  proof_path text,                                        -- private storage path
  status text not null default 'pending' check (status in ('pending','verified','rejected')),
  months int not null default 1 check (months between 1 and 12),
  period_start timestamptz, period_end timestamptz,
  reviewed_by uuid references public.profiles(id),
  reviewed_at timestamptz,
  reject_reason text,
  created_at timestamptz not null default now()
);
create unique index plan_payments_reference_unique on public.plan_payments (reference_no);
create unique index plan_payments_one_pending_per_owner on public.plan_payments (owner_id) where status = 'pending';
create index plan_payments_owner_idx on public.plan_payments (owner_id, created_at desc);
create index plan_payments_status_idx on public.plan_payments (status, created_at desc);

create table public.owner_plan_events (          -- audit trail, append only
  id bigint generated always as identity primary key,
  owner_id uuid not null references public.owners(id) on delete cascade,
  event text not null,                           -- assigned, renewed, expired, override_set, cars_hidden, cars_restored
  from_plan text, to_plan text,
  detail jsonb not null default '{}'::jsonb,
  actor uuid references public.profiles(id),
  created_at timestamptz not null default now()
);
```

Also: `alter table public.cars add column plan_hidden boolean not null default false;` — set to `true` only when a car was switched off **because of the plan limit** (so it can be restored later, and so a car an admin or owner switched off on purpose is never re-activated by mistake).

Add a settings row (`public.settings`): `plan_grace_days` = 3 and `platform_payment_qr_path` / `platform_payment_account_name` (the admin's QR shown to owners when paying a plan; the QR image goes in the existing private QR bucket with admin-only write).

### 3.2 Seed

Insert the four plans in section 1 (`custom` has `is_public=false`; `standard` has `is_featured=true`; `features` as the checklist strings from the design).

### 3.3 Backfill existing owners (important: do not hide anyone's cars)

For every existing owner insert an `owner_plans` row on `starter`, with:
- `car_limit_override = greatest(3, current count of active cars)` so nobody loses a car on day one,
- `commission_override = owners.commission_rate` so existing negotiated rates stay,
- `expires_at = null`.
The admin can then move owners to a real plan. Log a `assigned` event.

### 3.4 Effective plan and limit functions

```sql
-- plan an owner is entitled to right now (falls back to Starter when expired beyond grace)
create or replace function public.owner_effective_plan(p_owner uuid)
returns table(plan_id uuid, plan_code text, max_cars int, commission numeric, expires_at timestamptz, expired boolean)
language sql stable security definer set search_path = public as $$ ... $$;

create or replace function public.owner_car_usage(p_owner uuid)
returns table(used int, max_cars int) language sql stable security definer set search_path = public as $$ ... $$;
```

Rules inside:
- `max_cars = coalesce(owner_plans.car_limit_override, plan.max_active_cars)` when the plan is valid; otherwise the Starter limit (and no override unless the row says so).
- Valid = `expires_at is null or expires_at + (plan_grace_days || ' days')::interval > now()`.
- `commission = coalesce(commission_override, plan.commission_rate)` for a valid plan, else Starter rate.
- Grants: `owner_car_usage` and `owner_effective_plan` to `authenticated` only, and they must return data **only for the caller's own owner row or for admins** (check `auth.uid()` and `is_admin()`).

### 3.5 Keeping `owners.commission_rate` in sync

Bookings read `owners.commission_rate`, so a definer function `sync_owner_plan(p_owner uuid)` writes the effective commission into it. The existing trigger blocks non-admin changes, so:
- Open `reset_owner_payment_qr_verification` and add an allowed path, for example `current_setting('app.plan_sync', true) = 'on'`, which only `sync_owner_plan` sets with `set_config('app.plan_sync','on', true)` (transaction-local). This must work when called by the daily cron job (no `auth.uid()`).
- `sync_owner_plan` also calls the car-limit enforcement (3.6, "enforce") after it updates the rate.
- Never let a client set that setting: it is transaction-local and set inside a definer function only.

### 3.6 The car-limit check (the core rule)

Trigger on `public.cars` — `before insert or update of is_active, owner_id`:

```sql
create or replace function public.enforce_car_limit()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_max int; v_used int;
begin
  if new.is_active is not true then return new; end if;                       -- drafts/hidden are always allowed
  if tg_op = 'UPDATE' and old.is_active is true and new.owner_id = old.owner_id then return new; end if; -- no change
  perform 1 from public.owners where id = new.owner_id for update;             -- serialize concurrent inserts per owner
  select max_cars into v_max from public.owner_effective_plan(new.owner_id);
  select count(*) into v_used from public.cars
    where owner_id = new.owner_id and is_active and id is distinct from new.id;
  if v_used >= v_max then
    raise exception 'CAR_LIMIT_REACHED' using errcode = 'P0001',
      detail = format('limit=%s used=%s', v_max, v_used),
      hint = 'Upgrade your plan to publish more cars.';
  end if;
  return new;
end $$;
```

Notes:
- The `for update` lock on the owner row prevents two simultaneous inserts from both passing the check.
- The trigger runs for **every** path: owner browser calls, API routes, the admin client, `admin.from("cars").insert` in owner-application approval (those draft cars are `is_active=false`, so they pass).
- Admin can raise the limit through the plan or the override; there is no bypass flag.
- Revoke EXECUTE on `enforce_car_limit` from `public, anon, authenticated` (trigger functions do not need grants).
- Also: when an owner **reduces** their active count nothing happens; when a plan drops, use 3.8.

The app must catch `CAR_LIMIT_REACHED` and show a friendly message (section 5.2), never the raw database error.

### 3.7 Activating and renewing a plan

Admin-only definer function `admin_activate_owner_plan(p_owner uuid, p_plan_code text, p_months int default 1, p_payment uuid default null)`:
1. `is_admin()` required, else `raise exception 'Administrator access required.'`.
2. Validates the plan exists and `is_active`; months 1–12.
3. New `expires_at`: if the same plan is still valid → extend from the current `expires_at`; else `now() + months * 30 days`. `starter` always `expires_at = null`.
4. Upserts `owner_plans`, resets `reminder_stage = 0`, sets `updated_by = auth.uid()`.
5. If `p_payment` is given, marks that `plan_payments` row `verified` with `period_start/period_end`.
6. Calls `sync_owner_plan(p_owner)`, then **restores** cars: re-activate cars with `plan_hidden = true` oldest first until the new limit is reached (set `plan_hidden=false, is_active=true`).
7. Inserts an `owner_plan_events` row and calls `notify(owner_profile_id, 'plan_activated', ...)` with `{in_app,email}`.

Function `admin_set_owner_plan_override(p_owner uuid, p_car_limit int, p_commission numeric, p_note text)` sets/clears the two overrides (null clears), syncs, logs `override_set`.
Function `admin_extend_owner_plan(p_owner uuid, p_days int)` for goodwill extensions (1–90 days), logs it.
Function `admin_update_plan(...)` is **not needed**; plan row edits go through guarded column grants and `is_admin()` RLS (3.10), then the page calls `admin_resync_plan_owners(p_plan uuid)` which runs `sync_owner_plan` for all owners on that plan, after an explicit confirmation in the UI.

### 3.8 Expiry, downgrade and reminders (daily)

`expire_owner_plans()` — definer, run by pg_cron daily at 02:00 Manila (18:00 UTC), in the same guarded `do $$ ... if exists pg_cron` block style. Revoke from `public, anon, authenticated`.
1. **Reminders** (`notify`, `{in_app,email}`, dedupe key per owner and stage): 5 days before expiry (`reminder_stage` 0→1), 1 day before (1→2).
2. **Expiry:** for plans past `expires_at + grace`: set `status='expired'`, `sync_owner_plan` (falls back to Starter rate), then **hide extra cars**: if active cars > Starter limit, set `is_active=false, plan_hidden=true` on the **newest** cars first until the count fits. Never delete cars, bookings or photos. Existing confirmed bookings on a hidden car stay valid and appear in the owner's dashboard as normal. Send `plan_expired` (critical = false) and set `reminder_stage = 3`. Log `expired` and `cars_hidden`.
3. Idempotent: running it twice changes nothing.

Because the limit is also enforced by the cars trigger, an expired owner cannot re-activate cars above the Starter limit even if the cron job were delayed.

### 3.9 Plan payments (QR)

Owner flow writes `plan_payments`:
- Owner **insert** is allowed only with column grant `(plan_id, reference_no, proof_path, months)`; RLS: `owner_id` belongs to the caller; a before-insert trigger **sets `owner_id` check, `amount = plans.price_php * months`, `status='pending'`** and rejects free or inactive or non-public plans. The client can never set amount, status or reviewer.
- `proof_path` must start with `{auth.uid()}/` and point to the existing private proof bucket (reuse the same bucket policy pattern as payment proofs and top-ups: image/PDF, ≤ 10 MB, signed URLs for admins).
- Owner can read only their own rows. No update or delete for owners.
- One pending request per owner (partial unique index) and unique reference numbers (prevents reusing a reference or proof).
- Admin: `admin_review_plan_payment(p_payment uuid, p_approve boolean, p_reason text)` — `is_admin()` only. Approve calls `admin_activate_owner_plan(..., p_payment)`. Reject stores `reject_reason`, notifies the owner (`plan_payment_rejected`).
- Trigger after insert: `notify_admins('plan_payment_submitted', ...)` with `{in_app,push}` (same style as `notify_topup_events`).

Reference code: the owner page generates a display code like `PLAN-{first 6 of owner id upper}-{YYMM}` for the owner to type into their payment note; the owner then enters the **bank/GCash transaction reference** they received as `reference_no` (this is what must be unique).

### 3.10 RLS and grants (summary)

| Table | anon | authenticated owner | admin |
|---|---|---|---|
| `plans` | select where `is_public and is_active` | same | select all; update `name, tagline, price_php, max_active_cars, commission_rate, support_level, features, is_public, is_featured, is_active, sort_order`; insert via `is_admin()` policy |
| `owner_plans` | none | select own row only | select all; **no direct writes** (only the functions) |
| `plan_payments` | none | select own; insert column-limited | select all; updates only via `admin_review_plan_payment` |
| `owner_plan_events` | none | select own | select all; insert only from functions |

Everything else `revoke all ... from anon, authenticated` first, then grant explicitly. All new functions: `security definer`, `set search_path = public`, `revoke all ... from public, anon, authenticated`, then `grant execute ... to authenticated` **only** for the ones the app calls (`owner_effective_plan`, `owner_car_usage`, `admin_*`), and the `admin_*` functions check `is_admin()` inside. `expire_owner_plans`, `sync_owner_plan`, `enforce_car_limit` get **no** client grants.

## 4. Admin controls

### 4.1 `/admin/plans` (new, add to the admin sidebar)
- Table of plans: name, code, price, car limit, commission, support, public, featured, active, number of owners on it.
- Edit drawer (react-hook-form + zod, same rules as the DB checks). Save writes the plan row.
- When price, limit or commission changed, show a confirm dialog: *"12 owners are on Standard. Apply the new limit and commission to them now?"* with **Apply now** (calls `admin_resync_plan_owners`) and **Only new activations**. Show what will change.
- Creating a plan code `custom` variants is allowed; `starter` cannot be deactivated or deleted (the fallback). Never delete a plan that has owners; set `is_active=false` instead.
- Changing prices does not change anything already paid.

### 4.2 `/admin/plan-payments` (new)
- Queue tabs: Pending, Verified, Rejected. Row: owner, plan, amount, months, reference no, date, proof thumbnail (signed URL, opens in a lightbox).
- **Approve** (activates the plan) and **Reject** (reason required). Show duplicate-reference warnings. Confirmation before approving.
- Pending count badge in the sidebar, like Top-ups.

### 4.3 `/admin/owners/[id]` — new **Plan** card
- Current plan, status, expires on, grace state, **cars used / limit** with a meter, commission in effect (and whether an override is active).
- Buttons: **Change plan** (select + months), **Extend** (days), **Set override** (custom car limit and/or commission, with a required note), **Clear override**.
- Timeline from `owner_plan_events`.
- List of cars hidden by the plan (`plan_hidden`) with a button **Restore** (only works if under the limit).

### 4.4 `/admin/owners` list
- Add columns **Plan**, **Cars (used/limit)**, **Expires**; filter by plan and by "expiring in 7 days".

### 4.5 `/admin/settings`
- Fields: grace days (0–14), platform payment QR upload and account name (shown to owners on the pay screen). Only admins can write; validate image type and size, convert to WebP like other uploads.

## 5. Owner side

### 5.1 `/owner/plan` (new, add to owner sidebar)
- **Current plan card**: name, price, expires on (or *No expiry*), commission, and a usage meter `7 of 10 active cars`. Warning banner when ≤ 5 days left or in grace: *"Your plan ends on {date}. Renew to keep all your cars online."*
- **Plan cards** (same three as the pricing page, current one marked *Your plan*; upgrade and downgrade allowed). Downgrade shows a warning: *"You have 8 active cars. Standard allows 10 but Starter allows 3. Switching is only possible after you hide 5 cars."* Do not let the owner request a plan whose limit is below their active count (UI check plus server check in 5.3).
- **Pay flow** (drawer or page): choose months (1, 3, 6, 12; no discount in v1) → amount shown → platform QR and account name, display code → form: transaction reference, proof upload → submit → status chip *Waiting for review*. Show history of requests with statuses and reject reasons.
- Free plan (Starter) needs no payment. Moving to Starter is allowed when active cars ≤ 3 and is done by an admin function `owner_downgrade_to_starter()` callable by the owner for their own row only (checks the limit, keeps no refund, logs the event).
- Support level line: *Email support*, *Priority email support*, or *Priority support and onboarding help*.

### 5.2 `/owner/cars`
- Header shows `Active cars 3 of 3`. At the limit: the **Add car** and **Publish** controls stay usable for drafts, but **Publish/activate** is disabled with: *"You have reached your plan limit (3 cars). Upgrade your plan to publish more."* and a link to `/owner/plan`.
- Catch the `CAR_LIMIT_REACHED` error from server actions and API routes and map it to the same message (HTTP 409 from routes). Never show raw SQL text.
- Cars with `plan_hidden` show a badge *Hidden by plan* and the hint *Renew or upgrade to bring it back*.
- Car photo upload route (`app/api/owner/car-photos`) is unaffected (photos for hidden cars still allowed).

### 5.3 Server-side checks (in addition to the database)
- Server actions that publish a car or request a plan change must call `owner_car_usage` first to build friendly errors, but the **trigger is the real enforcement**.
- Plan request validation: plan exists, public, active, price > 0, months allowed, no other pending request.

## 6. Notifications

Types (use the existing `notify` function and notification settings; all `{in_app,email}` unless noted):

| Type | To | When |
|---|---|---|
| `plan_payment_submitted` | admins (`{in_app,push}`) | owner submits proof |
| `plan_activated` | owner | admin approves / activates |
| `plan_payment_rejected` | owner | admin rejects, with reason |
| `plan_expiring` | owner | 5 days and 1 day before expiry |
| `plan_expired` | owner | after grace, with how many cars were hidden |

Links: owner types → `/owner/plan`; admin type → `/admin/plan-payments`. Keep copy short and plain; no amounts in push text.

## 7. Types, files and structure

```
supabase/migrations/202611190001_owner_plans.sql
lib/plans/
  types.ts                // Plan, OwnerPlan, PlanPayment (generate from DB types)
  queries.ts              // getPublicPlans(), getOwnerPlan(), getCarUsage()
  breakEven.ts            // pure functions for the pricing page maths (+ unit tests)
  errors.ts               // CAR_LIMIT_REACHED mapping helper
app/pricing/page.tsx
app/owner/plan/{page.tsx,actions.ts,PlanCards.tsx,PayPlanDrawer.tsx,UsageMeter.tsx}
app/admin/plans/{page.tsx,actions.ts,PlanForm.tsx}
app/admin/plan-payments/{page.tsx,actions.ts}
components/pricing/{PlanCard.tsx,ComparisonTable.tsx,HowItWorks.tsx,PlanFaq.tsx}
```

Update: `app/owner/cars/*` (limit UI), `app/admin/owners/[id]` (Plan card), `app/admin/owners/page.tsx`, owner and admin layouts (nav items), footer and For owners page (links), `types/` (database types).

## 8. Security checklist (from the audit)

- [ ] Every new table has RLS on and explicit grants; `anon` has only `select` on public plans.
- [ ] No client can set `amount`, `status`, `owner_id` (triggers and column grants), nor write `owner_plans`.
- [ ] All new functions have `set search_path = public`, no EXECUTE for `public`/`anon`; admin functions check `is_admin()` inside.
- [ ] The `app.plan_sync` flag is transaction-local and only set inside `sync_owner_plan`.
- [ ] Proof uploads: private bucket, `{auth.uid()}/` prefix, MIME and size limits, signed URLs only for admins, unique reference numbers.
- [ ] Plan price edits are admin-only and do not alter verified payments or past bookings.
- [ ] Error messages shown to users never include SQL text.
- [ ] Rate-limit plan payment submissions (one pending per owner already enforced; also 5 per day per owner via a simple count check in the insert trigger).
- [ ] Do not log proof paths, references or account details to the console.
- [ ] Taxes: plan fees are income for the owner of the platform; keep the verified payments list exportable as CSV (admin) for bookkeeping.

## 9. Test plan (run with Supabase local or a scratch project)

SQL tests with `set local role authenticated` and `request.jwt.claims`:
1. Owner on Starter (limit 3) with 3 active cars inserts a 4th **active** car → fails with `CAR_LIMIT_REACHED`; inserting it as `is_active=false` works; activating it fails.
2. Two concurrent inserts at 2/3 cars → exactly one succeeds.
3. Admin sets override 5 → owner can activate up to 5.
4. Owner tries `update owner_plans`, `update plans`, `insert plan_payments` with `amount`/`status` set → rejected or ignored; amount always equals plan price × months.
5. Owner calls `admin_activate_owner_plan` directly → "Administrator access required."
6. Anonymous calls any new RPC → permission denied.
7. Approve a Standard payment → plan active, `expires_at` +30 days, `owners.commission_rate = 0.03`, new bookings snapshot 3%, old bookings unchanged, hidden cars restored (oldest first up to the limit), notification created.
8. Renew while still valid → expiry extends from the old expiry, not from today.
9. `expire_owner_plans()` after expiry + grace → status `expired`, commission back to 5%, extra cars hidden newest first with `plan_hidden=true`, bookings untouched; running again changes nothing.
10. Upgrade after expiry restores only `plan_hidden` cars, never cars switched off by the owner or admin.
11. Existing owners after backfill: no car is hidden; their commission is unchanged.
12. Reject a payment with a reason → owner notified, can submit a new request; duplicate reference refused.

App tests: pricing page renders from DB values (change a price in `plans`, page updates), mobile layout at 390px has no horizontal scroll, owner cars page shows the limit message, admin screens work, `npm run lint`, `npx tsc --noEmit`, `npm run build`.

## 10. Build order (one commit per step)

1. Migration: tables, seed, backfill, functions, triggers, RLS and grants. Apply to a scratch DB, run SQL tests 1–12.
2. Regenerate types; `lib/plans/*` with unit tests for the break-even and example maths.
3. Public `/pricing` page (+ links in footer, For owners, Apply; sitemap).
4. Owner `/owner/plan` and the `/owner/cars` limit UI and error mapping.
5. Admin `/admin/plan-payments`, then the Plan card on `/admin/owners/[id]`, then `/admin/plans` and settings fields.
6. Notifications and the daily cron job.
7. Final pass: security checklist, accessibility (labels, focus rings `#2E9BF0`, 44px targets, `aria-live` for status changes), Lighthouse.

## 11. Acceptance checklist

- [ ] `/pricing` matches the desktop and mobile designs and reads plans from the database.
- [ ] Break-even and example numbers are computed, not typed.
- [ ] An owner can never have more active cars than their limit, from any code path.
- [ ] The limit error is friendly in the UI and returns 409 from API routes.
- [ ] Plan payment by QR: submit, admin approve or reject, owner notified, plan activates, expiry set.
- [ ] Commission follows the plan for **new** bookings only; old bookings keep their snapshot.
- [ ] Expiry hides extra cars (newest first, flagged) and never deletes anything; renewal restores them.
- [ ] Existing owners lose nothing after the migration.
- [ ] Admin can edit plans, set overrides, extend, change plans, review payments and see a timeline.
- [ ] No client can write plan data directly; anonymous users can only read public plans.
- [ ] Reminders go out at 5 days and 1 day and are not duplicated.
- [ ] Lint, typecheck and build pass; SQL tests 1–12 pass.

## 12. Codex prompt

*"Implement `kuyog-bohol-pricing-and-plans.md` in the order of section 10, one commit per step. First read the existing trigger `reset_owner_payment_qr_verification`, `set_booking_owner_and_earnings`, the owner and admin pages named in section 0, and the notifications and pg_cron patterns, and follow them. Enforce the car limit in the database exactly as in section 3.6. Never hard-code prices, limits or rates. Apply every rule in section 8. Never print or commit secrets. Run the SQL tests in section 9 and `npm run lint`, `npx tsc --noEmit`, `npm run build`, then create `PLANS_REPORT.md` listing what was done, what was verified and anything you could not verify."*
