# Kuyog Bohol — Handover Staff (Owner Invites People Who Can Scan the Pickup Pass) (Instructions for Codex)

Goal: an owner who is not at the handover can let a trusted person (staff, driver, family member) scan the pickup pass, check the ID, collect the balance and confirm handover or return, **with their own login**, without sharing the owner's password and without seeing credits, payments or settings. Every action is logged with who did it.

Designs are on the design canvas, row "Handover staff": **owner list**, **invite sheet**, **staff detail**, **staff home**, **confirm handover**, **accept invite** (mobile), and **owner page** and **invite dialog** (desktop).

> Next.js 16 here has breaking changes. Read the relevant guide in `node_modules/next/dist/docs/` before changing layouts, routes, middleware or data fetching.

## Rules
- Staff sign in with **their own email and password** (decision: email, not a shared code, so access can be removed per person).
- Staff can do **only** these things for the owner who invited them: scan or enter the 6-digit code, check ID and confirm handover (with the balance step), confirm vehicle return, and see today's pickups and returns. Nothing else.
- Staff must never see: credits, ledger, payments and refunds, fees and invoices, rates, vehicle editing, settings, other owners' data, customer documents, or customer contact details beyond what the handover screen needs (name, vehicle, dates, reference, balance, verification chip).
- Do **not** change pickup, payment, commission or credit logic. Extend the existing pickup functions to accept a staff actor; the rules inside them (ID check required, window, docs verified, balance) stay the same.
- Brand tokens: primary `#0A47B1`, dark `#0A3D91`, light `#EAF4FF` / `#F3F9FF`, text `#0F2342`, muted `#5B6F89`, borders `#E3EEF9` / `#D6E6F7`, success `#12703A` on `#E3F7EA`, warning `#8A5A00` on `#FFF2D6`, danger `#A12A2A` on `#FDE8E8`. Inter headings, Work Sans body.
- Accessibility: 44px touch targets, visible focus rings, `aria-label` on icon-only buttons, dialogs trap focus and close on `Esc`, text 13px or larger, status chips have text (not color alone).
- Times in Asia/Manila. Amounts and references are never truncated.

## 0. Look at the code first and report
Open `supabase/migrations/202611220002_pickup_handover.sql`, `202611220003_pickup_admin.sql`, the pickup pass spec `kuyog-bohol-pickup-pass-qr.md`, `owner_lookup_pickup_pass`, the confirm pickup and return functions, `/owner/scan`, `components/owner/PickupScanner.tsx`, `app/owner/layout.tsx`, the owner shell and More menu, `lib/admin-context.ts` and owner context helpers, middleware or layout guards, the email helper (Resend), `notify`, `audit_write`, the owners table and the profile/role model, and how `/account` and `/owner` routes are protected. Report how identity is checked in each pickup function today, where a staff actor fits, and any difference from this file.

## 1. Data model (one migration)
Table `public.owner_staff`:
- `id uuid pk`, `owner_id uuid not null references owners(id)`, `profile_id uuid references profiles(id)` (null until the invite is accepted), `display_name text not null`, `email text not null` (lower-cased), `status text not null check (status in ('invited','active','paused','removed'))`, `invited_by uuid`, `invited_at`, `accepted_at`, `invite_token_hash text`, `invite_expires_at`, `last_handover_at`, `created_at`, `updated_at`.
- Unique index on `(owner_id, lower(email))` where `status <> 'removed'`.
- Limit: at most `max_staff_per_owner` (settings key, default **3**) rows with status invited, active or paused per owner. Enforce in the invite function, not only in the UI.
- RLS on: owners can **select** their own staff rows; no direct insert, update or delete from clients (all through the functions below). Staff can select only their own row.

Helper (definer, `set search_path = ''`, no client grant): `public.handover_actor(p_uid uuid)` returns `{ owner_id, role, staff_id }` where `role` is `owner` (the caller is the owner's profile) or `staff` (an active `owner_staff` row for that profile and an active, non-archived owner). Returns nothing otherwise.

Functions (definer, `set search_path = ''`, grant execute to `authenticated` only):
- `owner_invite_staff(p_name, p_email)`: caller must be an active owner who accepted the agreement; validates the limit; creates the row with a random token (store only its SHA-256 hash), expiry 7 days; returns the plain token once to the server action so the email link can be sent. Writes an audit entry `staff.invited` (no email in the detail beyond a masked form).
- `owner_set_staff_status(p_staff, p_status)`: owner only, for their own staff: `paused`, `active` (resume) or `removed`. Removing or pausing takes effect immediately for every function below. Audit `staff.paused`, `staff.resumed`, `staff.removed`.
- `owner_resend_staff_invite(p_staff)`: rotates the token and expiry for an `invited` row.
- `staff_accept_invite(p_token)`: caller is signed in; matches the token hash, not expired, status `invited`, and the signed-in user's email equals the invited email (case-insensitive); sets `profile_id`, `status = 'active'`, `accepted_at`, clears the token. Audit `staff.accepted`.
- `staff_today_handovers()`: for the caller's active staff row, returns **only** today's pickups and returns for that owner with: booking reference, customer first name and last name, vehicle label, time, type (pickup or return). No amounts, no contact details, no documents.

Existing pickup functions (`owner_lookup_pickup_pass`, confirm pickup, confirm return): replace the "caller is the booking owner" check with `handover_actor(auth.uid())` and require the booking's `owner_id` to equal the actor's `owner_id`. Keep every other rule. Record `actor_role` (`owner` or `staff`) and `staff_id` in the event `detail` and in the audit entry, and set `used_by` as today. Update `last_handover_at` on the staff row. Notify the owner for each staff handover ("Handed over by Ana: KB-7Q4M2"), and keep the existing customer notification text. The backup-code lookup stays limited to the actor's owner's active passes, and unknown or other-owner passes still return the same generic `NOT_VALID`.

Manual status buttons (`owner_set_booking_status`) stay **owner-only**; staff cannot use them.

## 2. Routes and access
- **Owner area:** `/owner/staff` (list, invite, detail), linked from More (mobile) and the sidebar (desktop). `/owner/staff/[id]` for detail.
- **Staff area:** `/staff` (home), `/staff/scan` (reuse the existing scanner component and result screen), `/staff/today`, `/staff/account`. Staff layout shows only the three-tab bar (Scan, Today, Account) and a "Staff" chip.
- **Invite link:** `/staff/accept?token=...` (public page, then sign in or sign up, then accept).
- **Guards:** a staff-only user cannot open `/owner/*` or `/admin/*` (redirect to `/staff`); an owner opening `/staff` is redirected to `/owner`. A person can be both a customer and staff with the same login: `/account` still works, `/staff` appears in their menu. If the staff member's owner is archived, deactivated or the staff row is paused or removed, `/staff` shows "Your access was turned off. Contact {business name}." and no data.
- Staff sessions never get the service role; all data comes through the functions above.

## 3. Owner UI (mobile and desktop)
Boards: *owner list*, *invite sheet*, *staff detail* (mobile); *owner page*, *invite dialog* (desktop).
1. **List** (`/owner/staff`): heading "Handover staff", subtitle "People who can scan and hand over vehicles for you.", one card with rows (initials avatar, name, status line, status chip: Active green, Invited amber, Paused gray), **Invite staff** button, counter "{n} of {max} staff used. Remove someone to invite another." (button disabled at the limit with that text), and two cards "Staff can" (four items with green checks) and "Staff cannot see" (three items with red crosses). Content is read from one constants file so the lists match the real rules.
2. **Invite sheet** (mobile bottom sheet; desktop dialog 520px): Name, Email, a "They will be able to" box (first three abilities), **Send invite**, **Cancel**, and the line "You are responsible for what your staff do. You can remove them any time." Validate email format; duplicate or over-limit shows a plain error. Success toast "Invite sent to {email}". The email comes from the existing email helper and contains the one-time link; it expires in 7 days.
3. **Staff detail:** name, email, status, **Recent handovers** (last 10: reference · pickup or return, vehicle · customer, time), **Pause access** (or **Resume**), **Remove** (confirm sheet: "Remove {name}? They will lose access right away. Past handovers stay in your history."), and for invited rows **Resend invite** and **Cancel invite**.
4. **Owner booking and audit views:** wherever the booking shows "Picked up by scan", add who did it: "Picked up by scan · Ana (staff) · Today 9:12 AM". Admin booking details and the audit log show the same, with the staff name and owner business.
5. Not shown to owners who have not accepted the partner agreement or are archived. Empty state: "No staff yet. Invite someone you trust to hand over vehicles when you are away."

## 4. Staff UI (mobile)
Boards: *staff home*, *confirm handover*, *accept invite*.
1. **Accept invite** (`/staff/accept`): "{Business} invited you", one line "You can scan pickup passes and hand over vehicles for them.", the three abilities, email prefilled and read-only, "Create a password" (at least 8 characters; reuse the existing sign-up rules), **Accept and continue**, and "Already have an account? Sign in to accept." Invalid or expired link shows a plain message and a way to ask the owner for a new one.
2. **Home** (`/staff`): "Hi, {first name}", business name, a large **Scan a pickup pass** card with **Open scanner** and the note "Or enter the 6-digit code.", and **Today** (count of pickups and returns) with rows: vehicle · customer, time, chip Pickup or Return. No amounts anywhere on this screen.
3. **Confirm handover:** reuse the existing scan result screen with the same checks (pass valid chip, documents verified chip, "I checked the customer's ID", the balance to collect with "I received the balance", **Confirm handover**) and the footer "Recorded as handled by {name} (staff of {business})". Window, override and document rules behave exactly as for the owner, except that **staff cannot override**: a pass outside the allowed window or with unverified documents shows "Ask {business} to complete this" and a call or message action if the owner's phone number is already public in the app.
4. **Return:** staff can confirm a return with the same screen the owner uses.
5. **Account:** name, email, business, **Sign out**, and "Need help? kuyogbohol@gmail.com".
6. Camera permission, weak signal and offline states follow `kuyog-bohol-connection-states.md` and the scanner's existing behavior. The backup code option is always visible.

## 5. Agreement and abuse protection
- Add one point to the partner agreement content file: "You are responsible for anyone you invite to hand over vehicles for you." Bump the agreement version only if Jabez decides to; otherwise add it to the next version and report.
- Rate-limit invite sending per owner (for example 10 per day) and failed code lookups per staff member, reusing the existing limiter if there is one.
- A staff row is bound to one owner. A person who works for two owners needs two invites; the staff home then lets them switch business (if more than one active row exists), with the active business shown in the header.
- Invite tokens are single use and stored hashed. Never log tokens, codes or passwords.

## 6. Loading, empty and error states
List and detail pages show skeletons while loading. A failed load shows a plain message with **Try again**, and the rest of the page keeps working. Server errors use plain sentences, never database text.

## 7. Tests
1. Owner invites Ana: the email arrives with a link; accepting with a different email address fails; accepting with the right one makes the row active and `/staff` opens; the link cannot be reused and expires after 7 days.
2. Limit: the fourth staff invite is refused by the function and the button shows the limit text.
3. Staff scans a valid pass for their owner: handover completes with the same rules (ID check required, balance step, window, docs verified), the booking becomes picked up, the event and audit entry show `actor_role = staff` with the staff name, the owner is notified, and the customer gets the usual message.
4. Staff scans another owner's pass or a wrong code: the same generic "not valid" result as for owners; staff cannot enumerate passes.
5. Staff cannot reach `/owner/*`, `/admin/*`, credits, payments, vehicle or settings data, either by URL or by calling the Supabase client directly (try selecting from bookings, payments, owner_credit_ledger, vehicles; expect no rows or denied). `staff_today_handovers()` returns only that owner's items for today and no amounts or contact details.
6. Pause or remove staff: their very next request is refused, the open scanner shows "Your access was turned off", and past handovers stay in the history. Resume restores access.
7. Staff cannot use manual status changes or overrides; an out-of-window pass tells them to ask the owner.
8. Owner archived or deactivated: staff lose access immediately.
9. A user who is both a customer and staff keeps `/account` access and gains `/staff`; sign-out clears both.
10. Mobile 360px and desktop 1280px: no horizontal scroll, nothing hidden behind the bottom bar; keyboard and screen reader pass on tabs, sheets, dialogs and the scanner.
11. `npm run lint`, `npx tsc --noEmit`, `npm run build`; database tests added for the new functions and for the changed pickup functions (owner path still passes).

## Out of scope
Staff scheduling, shifts or per-vehicle permissions, staff payroll or commissions, staff access to payments or credits, SMS or code-only logins, customer-facing staff profiles, any change to pickup rules, payments or commission.

## Codex prompt
*"Read `kuyog-bohol-handover-staff.md`. First report how the pickup pass functions, the scanner, the owner and admin layouts, route guards and the email helper work today, and where a staff actor fits. Then implement handover staff: the `owner_staff` table and the invite, status, accept and today's-handovers functions, the change to the existing pickup functions so an active staff member of the owner can scan, confirm handover and confirm return with the same rules, the owner staff pages, the staff area with its guards, the accept-invite page, the 'picked up by' labels, and the agreement line. Staff must never see credits, payments, settings or documents, and staff cannot override or use manual status buttons. Add no other pickup, payment, credit or commission changes. Run lint, typecheck and build, add database tests, run the tests in section 7, and list anything you could not verify."*
