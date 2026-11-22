# Kuyog Bohol — Pickup Pass (QR Check-in at Handover) — Implementation Spec for Codex

**Repo:** `OggyYggo/jc-rentals` (Next.js 16 App Router, React 19, TypeScript, Tailwind 4, shadcn/ui, Supabase Postgres + RLS, Vercel).
**Goal:** reduce fraud and disputes at handover. After the owner has confirmed the customer's reservation payment, the customer gets a **Pickup Pass** (QR code plus a 6-digit backup code). At pickup the owner scans it, checks the customer's ID and the balance on one screen, and taps **Confirm handover**. The booking then becomes **picked up**, the balance is recorded as received, and the event is logged.
**Design reference:** `kuyog-bohol-pickup-pass-design.png` (4 screens and the QR style) and `kuyog-bohol-pickup-qr-sample.png` (sample QR; it is **not** a real pass). Attach both when giving Codex this spec.
**Related specs:** `kuyog-bohol-qr-payment-hardening.md`, `kuyog-bohol-testing-fixes-plan.md`, `kuyog-bohol-audit-log.md`, `kuyog-bohol-ratings-and-reviews.md`, `kuyog-bohol-motorcycles.md`, `kuyog-bohol-sweetalert.md`.

> Next.js 16 here has breaking changes. Read the relevant guide in `node_modules/next/dist/docs/` before writing routes, server actions or caching code, and follow the existing patterns in the repo.
> The QR payment hardening spec and the testing fixes plan may already have changed the payment and booking code. **Re-read the files named below before editing**, and adapt this spec to what exists.

---

## 0. What exists today (read in the repo, Nov 18 snapshot)

- Booking statuses: `pending, confirmed, picked_up, returned, completed, cancelled, rejected` (plus `awaiting_payment, payment_review, expired` from the payment module).
- `owner_set_booking_status(booking_uuid, next_status)` (`202611060003_payment_qr_module.sql`): the owner moves `confirmed → picked_up` **only if `bookings.payment = 'paid'`**, then `picked_up → returned → completed`. Error text: *"Record the pickup balance before marking it picked up."*
- `owner_mark_payment_received(booking_uuid, payment_method)`: for `confirmed` or `picked_up` bookings it inserts a **verified payment** of `balance_at_pickup` and sets `bookings.payment = 'paid'`. Methods: `cash, gcash, bank_transfer, other`.
- Owner UI `components/owner/booking-workflow.tsx`: buttons **Mark picked up**, **Mark returned**, **Complete**, and a payment method select with **Record payment**.
- Customer UI: `components/customer/booking-list.tsx` and `app/account/bookings/[id]/pay/page.tsx`.
- Customer verification: `profiles.verification` (`none, pending, approved, rejected`) with documents in the private bucket; the owner does not see documents.
- Package `qrcode` (`^1.5.4`) is already installed. No QR scanner library is installed.
- Notifications use `notify()` / `notify_admins()`; the audit log spec defines `audit_write`.
- Every definer function in the payment module uses `security definer` and `set search_path = ''`; follow that.

## 1. Decisions

| Topic | Decision |
|---|---|
| What the scan means | **Handover happened**: booking becomes `picked_up`. It does **not** mean the reservation payment arrived (that stays confirmed by the owner's own wallet check) |
| "Marks as paid" | The scan screen records the **balance due at pickup** as received (through the same logic as `owner_mark_payment_received`) when the owner ticks *I received ₱X* and picks the method. Reservation deposit is already paid by then |
| Who can use a pass | Only the **owner of that booking's vehicle** (or an admin), while logged in. A stranger who scans it sees nothing useful |
| QR content | A link with a random token: `{NEXT_PUBLIC_SITE_URL}/p/{token}`. No personal data, no booking id, no amounts |
| Backup code | 6 digits, shown under the QR; works only inside the owner's scan screen |
| Pass lifetime | Created when the reservation payment is confirmed; valid from 1 day before the start date until the end date (settings, section 2.1); one use; dies on cancel, expiry or reassignment |
| ID check | The owner must tick *I checked the customer's ID matches this booking* before confirming (recorded) |
| Offline and weak signal | The customer can save the pass as an image; the owner needs a connection to confirm (manual status buttons stay as a fallback) |
| Return | Phase 2: the same QR, scanned when the booking is `picked_up`, marks it `returned` |
| Fallback | The existing manual buttons keep working; manual changes are logged as `manual` events |

## 2. Database (migration `2026112200xx_pickup_pass.sql`)

All new functions: `security definer`, `set search_path = ''`, schema-qualified names, `revoke all ... from public, anon, authenticated` then grant only what is listed. Use `extensions.gen_random_bytes` (check that `pgcrypto` is installed under the `extensions` schema) for secrets; do not use `random()`.

### 2.1 Settings

Add to `public.settings` (validated in the admin settings action, ranges in brackets):
- `pickup_early_days` = `1` [0 to 3]: how many days before `start_date` a pass can be used.
- `pickup_late_days` = `0` [0 to 3]: days after `end_date`; normally 0.
- `pickup_require_verified_docs` = `true`: self-drive pickups require `profiles.verification = 'approved'`.

### 2.2 Tables

```sql
create table public.booking_pickup_passes (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null unique references public.bookings(id) on delete cascade,
  owner_id uuid not null references public.owners(id),
  token text not null unique check (char_length(token) >= 40),
  backup_code text not null check (backup_code ~ '^[0-9]{6}$'),
  status text not null default 'active' check (status in ('active','used','revoked')),
  rotations smallint not null default 0 check (rotations <= 3),
  created_at timestamptz not null default now(),
  used_at timestamptz,
  used_by uuid references public.profiles(id)
);
create unique index booking_pickup_passes_owner_code_active
  on public.booking_pickup_passes (owner_id, backup_code) where status = 'active';

create table public.booking_pickup_events (
  id bigint generated always as identity primary key,
  booking_id uuid not null references public.bookings(id) on delete cascade,
  kind text not null check (kind in ('pass_created','pass_rotated','pass_revoked','pickup_confirmed','return_confirmed','override','manual','lookup_failed')),
  actor_id uuid references public.profiles(id),
  detail jsonb not null default '{}'::jsonb,       -- non-sensitive only: method, balance amount, override reason, id_checked
  created_at timestamptz not null default now()
);
create index booking_pickup_events_booking_idx on public.booking_pickup_events (booking_id, created_at);

create table public.pickup_scan_attempts (
  id bigint generated always as identity primary key,
  owner_profile_id uuid not null references public.profiles(id) on delete cascade,
  ok boolean not null,
  created_at timestamptz not null default now()
);
create index pickup_scan_attempts_idx on public.pickup_scan_attempts (owner_profile_id, created_at);
```

RLS on all three: enabled; `revoke all ... from anon, authenticated`; **no direct select** for customers or owners on `booking_pickup_passes` (the token must only leave through the definer functions). Admins may select all three through a policy `using (public.is_admin())` plus `grant select ... to authenticated`. Owners and customers read events only through the booking detail RPCs if needed (not required in v1).

### 2.3 Creating and revoking the pass

- `public.ensure_pickup_pass(p_booking uuid)` (internal, definer, no client grant): creates the pass when the booking is `confirmed` and `payment` is `partial` or `paid` (reservation verified); token = 64 hex characters from two random UUIDs or `gen_random_bytes(32)`; backup code = random 6 digits, retried until unique for that owner among active passes. Idempotent. Writes a `pass_created` event.
- **Trigger** `after update of status on public.bookings` (definer): when `new.status = 'confirmed'` call `ensure_pickup_pass`; when `new.status in ('cancelled','rejected','expired')` set the pass `revoked` and log `pass_revoked`; when `new.status in ('picked_up','returned','completed')` and the pass is still active, set `used` (for manual pickups). Backfill: create passes for existing `confirmed` bookings at the end of the migration.
- If the hardening work changed which status means "reservation paid", use that; the rule is *reservation payment confirmed by the owner or admin*.

### 2.4 Customer: reading the pass

```sql
create function public.get_my_pickup_pass(p_booking uuid) returns jsonb ...
```
Definer. Checks the caller is the booking's `customer_id`. Returns `{ state, token, backup_code, start_date, end_date, pickup_time, vehicle_label, mode, balance_at_pickup, deposit_amount, valid_from, valid_until }` where `state` is one of `not_ready` (awaiting or reviewing payment), `ready`, `today`, `used`, `expired`, `cancelled`. Never returns the token when the state is not `ready` or `today`.

```sql
create function public.rotate_my_pickup_pass(p_booking uuid) returns void ...
```
Customer can issue a new token and code if they believe the pass leaked (max 3, only while `active`); logs `pass_rotated`; revokes the old token.

### 2.5 Owner: lookup and confirm

```sql
create function public.owner_lookup_pickup_pass(p_token text default null, p_code text default null) returns jsonb ...
```
Rules:
1. Caller must be an active owner (`owners.profile_id = auth.uid()` and `is_active`) or an admin. Otherwise return `{ "result": "NOT_VALID" }`.
2. **Rate limit:** count failed attempts in `pickup_scan_attempts` for this profile in the last 10 minutes; at 5 or more, return `{ "result": "LOCKED", "retry_after_seconds": ... }` and do not look anything up. Log every attempt (`ok` true or false).
3. Find the pass: by exact `token`, or by `backup_code` **only among this owner's active passes** (`owner_id` equals the caller's owner). Unknown token, another owner's token and wrong code all return the **same generic** `{ "result": "NOT_VALID" }` so passes cannot be enumerated.
4. Evaluate in this order and return the first failing `result` plus the booking details needed for the screen: `ALREADY_USED` (with used time), `NOT_VALID` (cancelled, expired, rejected, or reservation payment not confirmed), `NOT_TODAY` (outside the allowed window; return the start date; the owner may continue only with an override reason), `DOCS_NOT_VERIFIED` (self-drive and `pickup_require_verified_docs` and verification not `approved`), else `OK`.
5. Payload (never the customer's phone, email, documents or IP): `booking_id`, `reference`, customer **full name as on the profile** (the owner needs it to match the ID), vehicle label and plate, dates, mode, `payment` state, `balance_at_pickup` (0 if already paid), `deposit_amount` (safety deposit, self-drive only), `verification` boolean flags (`license_ok`, `id_ok`), `stage` (`pickup` when status is `confirmed`, `return` when `picked_up`).

```sql
create function public.owner_confirm_pickup(
  p_booking uuid, p_token text, p_id_checked boolean,
  p_balance_received boolean default false, p_balance_method text default null,
  p_override_reason text default null) returns void ...
```
In **one transaction** with `select ... for update` on the booking and the pass:
1. Caller owns the booking (or is admin); booking `status = 'confirmed'`; pass `status = 'active'` and `token = p_token` (so a stale screen cannot confirm another booking).
2. `p_id_checked` must be true (`ID_CHECK_REQUIRED`). If outside the window, `p_override_reason` is required (5 to 200 chars) and an `override` event is logged. Self-drive with unverified documents and the setting on: refuse (`DOCS_NOT_VERIFIED`) for owners; admins may continue with a reason.
3. Balance: if `balance_at_pickup > 0` and `payment <> 'paid'`, require `p_balance_received = true` and a method in `cash, gcash, bank_transfer, other` (`BALANCE_REQUIRED`); then insert the verified balance payment and set `payment = 'paid'` **by calling the same internal logic as `owner_mark_payment_received`** (refactor that logic into one private function and call it from both, so they cannot drift).
4. Set `status = 'picked_up'` (bypass the manual rule only inside this function; keep `owner_set_booking_status` as is), set the pass `used`, `used_at`, `used_by`.
5. Insert a `pickup_confirmed` event with `detail = { method, balance_amount, id_checked: true, override: bool }` and call `audit_write` if the audit log exists.
6. Notify the customer (`notify`): *"Pickup confirmed. Enjoy your ride and drive safely."* with a link to `/account/bookings`. Never put amounts or codes in the push text.
7. Errors use stable codes: `PASS_NOT_VALID`, `ALREADY_USED`, `NOT_TODAY`, `DOCS_NOT_VERIFIED`, `ID_CHECK_REQUIRED`, `BALANCE_REQUIRED`, `LOCKED`.

Phase 2 (return) adds `owner_confirm_return(p_booking, p_token, p_notes text)`: requires `status = 'picked_up'` and the same pass; sets `returned`, logs `return_confirmed`, notifies the customer. The pass stays `used` after pickup; for the return scan, lookup accepts a `used` pass whose booking is `picked_up` and reports `stage = 'return'`. Keep this behind a feature flag `pickup_return_scan` (setting, default off) until tested.

### 2.6 Existing manual flow

`owner_set_booking_status` still works; add a trigger or small change so every manual `confirmed → picked_up` writes a `manual` event and marks the pass `used`. Admin booking details show the event trail.

## 3. QR design (follow the design sheet)

Generate the QR **server-side** (never from a third-party service) with the installed `qrcode` package:
- Content: `${NEXT_PUBLIC_SITE_URL}/p/${token}`.
- Use `QRCode.create(url, { errorCorrectionLevel: 'H' })` to get the module matrix and **render your own SVG** in a server or client component (`components/pickup/PickupQr.tsx`) so the style is controlled:
  - Dark modules `#0A3D91` on white `#FFFFFF`, **always light**, even in dark mode.
  - **Rounded modules** (draw each dark module as a rounded rect or circle with radius about 35 percent of the module; keep the three finder squares as solid rounded squares).
  - **Center logo**: the tarsier logo (`public/icon-512.png` or an SVG version) in a white circle, diameter at most **20 percent** of the QR width, with a white ring about 12 percent larger; do not remove modules beyond what error correction H allows. Skip the logo if the matrix is version 3 or smaller.
  - Quiet zone at least 2 modules, inside a white card with 14 px padding, 22 px rounded corners and a 2 px `#D6E6F7` border.
  - Size: 300 px on phones (minimum 240 px), scales with the container; print size at least 4 cm.
- **Test the style:** the sample image provided was decoded successfully with the logo and rounded modules. After building the real component, verify decoding with at least two scanners (the in-app scanner and a phone's native camera) at 240 px and under a low-brightness screen.
- Under the QR: the **backup code** in 38 px bold with letter spacing (format `482 917`), booking reference with a **Copy** button (shared `CopyButton` from the testing fixes plan), vehicle and pickup lines, the balance due, and the line *"Show this to the owner. Bring your driver's license and government ID."*
- **Save as image** button: draw the card to a canvas (or `html-to-image`; check the library's current docs and bundle cost) and download a PNG named `kuyog-bohol-pickup-pass-{reference}.png`. A text note: *"Increase your screen brightness when scanning."* Optionally request a screen wake lock (`navigator.wakeLock`, in try/catch) while the pass page is visible.
- A small **SAMPLE** stamp is only for the design mock; do not show it in the app.

## 4. Customer UI

- **Booking card** (`booking-list.tsx`): for `confirmed` bookings add a **Pickup pass** button (primary on the pickup day, secondary before).
- **Page `/account/bookings/[id]/pickup`** (server component, no-store): calls `get_my_pickup_pass`; renders by `state`:
  - `not_ready`: *"Your pickup pass appears after the owner confirms your payment."* with a link to the payment page.
  - `ready` / `today`: the pass as in the design (status chip *Ready for pickup* or *Pickup today*), QR, backup code, booking details, **Save as image**, and a small link *"I think my pass was shared"* → rotate (confirm dialog).
  - `used`: *"Picked up on {date and time}"*, no QR, link to the booking; if the return scan is enabled show the **Return pass** state.
  - `expired` / `cancelled`: a short explanation and a link to My bookings or support.
- Keep the page fresh while open: refresh when the tab becomes visible and every 20 seconds while the state is `ready` or `today` (stop when `used`). A toast appears when pickup is confirmed.
- Loading states with the repo's skeletons; mobile first at 390 px; no horizontal scroll; the QR never gets blurry (SVG).
- Notifications: when the pass is created, notify the customer *"Your pickup pass is ready"* (in-app, push); on the morning of `start_date` send one reminder (cron `0 0 * * *` UTC = 8:00 Manila, dedupe per booking): *"Your pickup is today. Open your pickup pass."* Do not include the code.

## 5. Owner UI

- **Entry points:** a **Scan pickup pass** button on `/owner/bookings` (top), on the owner dashboard, and in the mobile bottom or top navigation as a quick action. Route `/owner/scan`.
- **`/owner/scan`** (`components/owner/PickupScanner.tsx`, client): camera preview in the design's dark view with the blue corner frame and the hint text; **Enter 6-digit code instead** opens a numeric input (`inputmode="numeric"`, 6 boxes, auto submit, paste support).
  - Decoding: use the browser `BarcodeDetector` when available, with a JavaScript fallback library (for example `qr-scanner` or `jsqr`; verify the current version, size and maintenance before choosing, and lazy load it with `next/dynamic` only on this route). Camera needs HTTPS (production is HTTPS; localhost is fine). Request `facingMode: 'environment'`; stop all tracks on unmount and on success; decode once (debounce) and vibrate briefly (`navigator.vibrate`, optional); optional torch toggle where supported.
  - Accept only URLs that start with `${NEXT_PUBLIC_SITE_URL}/p/` (and the preview domains configured in an allowlist); anything else shows *"This is not a Kuyog Bohol pickup pass."* Extract the token and call the lookup (below).
  - Permission denied or no camera: show a plain explanation (how to allow the camera in the browser settings) and keep the backup code option visible.
- **Route `/p/[token]`** (server component, `dynamic`, `noindex`, `Cache-Control: no-store`, `Referrer-Policy: no-referrer`): makes the QR also work with a phone's native camera app. Logged out → login page and return here afterwards (add `/p/` to the allowed `next` list in `app/auth/confirm` and the login redirect). Logged in as the booking's owner → renders the **Check and confirm** screen (same component as the scanner result). Logged in as anyone else → a neutral page *"This is a Kuyog Bohol pickup pass. Only the vehicle owner can use it in the app."* with no booking data.
- **Check and confirm screen** (`PickupCheck.tsx`), as in the design:
  - Top banner by result: green **Valid pass**; amber for `NOT_TODAY` (with the start date and an *I agreed to an early or late handover* reason field) and `Balance due`; red for `Already used`, `Not valid`; blue for `DOCS_NOT_VERIFIED` (*"Ask the customer to complete verification or contact Kuyog Bohol support."*); `Locked` shows the wait time.
  - Booking facts: customer full name, vehicle and plate, dates and mode, safety deposit (self-drive).
  - Checks list with ticks: reservation deposit paid, license verified, ID verified, pickup date is today.
  - **Balance** card (only when `balance_at_pickup > 0` and not paid): amount, **Paid by** select (Cash, GCash, Bank transfer, Other), checkbox **I received ₱X**.
  - Checkbox **I checked the customer's ID matches this booking**.
  - Buttons: **Confirm handover** (disabled until the needed boxes are ticked; shows the pending state with the shared submit button) and **Cancel**.
  - After success: a confirmation view *"Handed over. Booking is now Picked up."* with **Scan another** and **Back to bookings**; the owner list refreshes.
  - Errors map from the stable codes to plain sentences (never raw database text). Use the SweetAlert helper for the final confirmation only if the rest of the app does; otherwise inline.
- Owner booking card shows a small **Picked up by scan** or **Picked up manually** label with the time.

## 6. Admin

- Booking details (`/admin/bookings`): show pass state, pickup event trail (who, when, method, override reason), and a **Reset pass** action (definer RPC, admin only, reason required, audit logged) that revokes the pass and issues a new one.
- Admin settings: the three settings in 2.1 with validation.
- Overview/metrics: share of pickups confirmed by scan; overrides count (digest-level in the admin alerts spec, event key `pickup.override`, mode **Digest**).
- Admin can run the same scan flow on behalf of an owner only with a reason (rare); keep the code path but restrict the UI to the booking details page.

## 7. Security and privacy

- Tokens are random 256-bit values; the table has no client grants; tokens leave the database only via `get_my_pickup_pass` (customer, own booking) and are compared server-side. Backup codes work only inside the logged-in owner's own passes and are rate limited (5 failures in 10 minutes locks lookups for 10 minutes; also apply a per-IP limit in the route handler).
- Generic `NOT_VALID` for unknown tokens, other owners' tokens and wrong codes: no enumeration.
- The `/p/[token]` route and the scanner never expose customer phone, email, documents or exact address; the owner sees the customer's name only to match their ID.
- QR content has no personal data; the URL token appears in access logs, so the page sends `Referrer-Policy: no-referrer` and no analytics scripts run on it; tokens are useless without the owner's session and die after one use.
- All writes in one transaction with row locks to prevent double confirmation (two owners' devices, two taps).
- Every confirmation, override, rotation, reset and failed-lookup burst is logged in `booking_pickup_events` (and the audit log); events contain no secrets.
- Camera access is requested only on `/owner/scan` and stopped when leaving.
- Notification texts contain no codes, tokens or amounts.
- No new `anon` EXECUTE; definer functions check ownership inside; `search_path = ''`; RLS on all new tables.
- A forwarded screenshot can be used by someone else: that is why the ID check checkbox is mandatory and recorded, and why the customer can rotate the pass.

## 8. Test plan

SQL (switch roles with JWT claims):
1. A pass is created exactly once when the booking becomes `confirmed` with a verified reservation payment; none for `awaiting_payment` or `payment_review`; cancel, reject and expiry revoke it.
2. `get_my_pickup_pass`: another customer gets nothing; `not_ready` and `used` states never return the token.
3. Lookup by token as the right owner → `OK`; other owner, customer, anon, unknown token, wrong backup code → the **same** `NOT_VALID`; 5 failures → `LOCKED`.
4. Window: too early or too late → `NOT_TODAY`; confirm without override reason fails; with a reason works and logs `override`.
5. Self-drive with `verification <> 'approved'` and the setting on → `DOCS_NOT_VERIFIED` for owners.
6. Confirm: requires `p_id_checked`; with balance due requires `p_balance_received` and a valid method; inserts one verified balance payment, sets `payment = 'paid'`, status `picked_up`, pass `used`, one `pickup_confirmed` event; a second confirm returns `ALREADY_USED`; concurrent confirms (two sessions) produce exactly one pickup.
7. Stale token: confirm with the wrong token for a booking fails.
8. Existing flows: `owner_set_booking_status`, `owner_mark_payment_received`, manual pickup (logs `manual`), cancellation, refunds still work. The shared balance logic produces identical rows from both paths.
9. Rotation: max 3; old token no longer works; new one does.

App and integration:
- Customer page renders each state; QR decodes with the in-app scanner and the native camera at 240 px and at low brightness; **Save as image** produces a decodable PNG; refresh behavior and toast on pickup.
- Owner scanner: camera permission denied, no camera, wrong QR (non-Kuyog URL), backup code flow, torch (if supported), camera stops on navigation; works on Android Chrome and iPhone Safari (verify `BarcodeDetector` fallback behavior on iOS).
- `/p/[token]`: logged out → login → back; non-owner sees the neutral page; headers `noindex`, `no-store`, `no-referrer` present.
- Check screen: disabled and enabled states, balance method, override field, error mapping; no raw database errors.
- Notifications fire once with no sensitive text; morning reminder dedupes.
- 390 px layouts, keyboard and screen reader (labels, focus, live region for results).
- XSS test with a customer name like `<img src=x onerror=alert(1)>` renders as text.
- `npm run lint`, `npx tsc --noEmit`, `npm run build`; bundle check that the scanner library loads only on `/owner/scan` and `/p/[token]`.

## 9. Build order (one commit per step)

1. Migration: settings, tables, RLS, `ensure_pickup_pass`, trigger, backfill, `get_my_pickup_pass`, `rotate_my_pickup_pass`; SQL tests 1 to 2 and 9.
2. `PickupQr` component (server-rendered SVG, rounded style, logo) with a decoding test; customer pass page, booking-card button, Save as image, notifications.
3. Owner lookup and confirm functions, refactor of the shared balance logic; SQL tests 3 to 8.
4. Owner scanner (`/owner/scan`), `/p/[token]` route, check screen, entry points, auth redirect allowlist.
5. Admin booking details (events, reset pass), settings fields, metrics.
6. Phase 2 (behind the flag): return scan and optional return notes.
7. Final pass: security checklist, accessibility, mobile and real-device scan tests, loading and error states.

## 10. Acceptance checklist

- [ ] After the owner confirms the reservation payment, the customer sees a Pickup Pass with a QR, backup code and booking details that match the design sheet; the pass can be saved as an image.
- [ ] The owner can scan it (in-app scanner or phone camera) or enter the backup code, sees the check screen, and **Confirm handover** sets the booking to picked up, records the balance when due, and logs the event.
- [ ] Only the booking's owner can use a pass; strangers learn nothing; unknown, foreign and wrong inputs look identical; repeated failures lock out.
- [ ] The ID-check box is mandatory and recorded; early or late handovers need a reason; unverified documents block self-drive pickups when the setting is on.
- [ ] A pass can be used once; confirmation is race-safe; cancelled, expired or reassigned bookings revoke it.
- [ ] The manual buttons still work and are logged; both paths record the balance payment the same way.
- [ ] The QR matches the design: rounded blue modules on white, logo at most 20 percent, error correction H, decodes reliably at 240 px.
- [ ] No personal data in the QR, no secrets in notifications or logs, no new anonymous EXECUTE, RLS on all new tables.
- [ ] Lint, typecheck, build and all tests pass; scanner library is lazy loaded.

## 11. Things to verify on real devices (cannot be decided from code)

- Camera and `BarcodeDetector` behavior on iPhone Safari and common Android browsers; choose the fallback library accordingly.
- Reading the QR with the native camera from the lock screen and from within the Facebook, Messenger and Chrome in-app browsers.
- Screen brightness and glare in outdoor use at 240 px and 300 px.

## 12. Codex prompt

*"Implement the Pickup Pass following `kuyog-bohol-pickup-pass-qr.md` and the design in `kuyog-bohol-pickup-pass-design.png` (QR style: `kuyog-bohol-pickup-qr-sample.png`). First read `202611060003_payment_qr_module.sql` (owner_set_booking_status, owner_mark_payment_received, confirm_booking_payment), `components/owner/booking-workflow.tsx`, `components/customer/booking-list.tsx`, the pay page, and check what the payment hardening work already changed; read the Next.js 16 docs in `node_modules/next/dist/docs/` first. Build in the order of section 9, one commit per step. Keep tokens out of client reach except through the definer functions, return the same generic result for unknown, foreign and wrong inputs, make confirmation one transaction with row locks, refactor the balance-recording logic so both paths share it, generate the QR on the server with the installed `qrcode` package in the specified style, lazy load the scanner library, and never put codes, tokens or amounts in notifications. Run lint, typecheck, build and the SQL tests, and list anything you could not verify, especially the real-device camera and scanning checks."*
