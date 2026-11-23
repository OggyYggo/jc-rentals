# Kuyog Bohol — Customer Booking Flow: Mobile UI (Instructions for Codex)

Implements the nine mobile screens from the design canvas row **"Booking: 1 … 9"**. Each screen is tagged **Live**, **Live, needs fix** or **Planned**.

## Hard rules

- **Mobile only.** Use Tailwind classes that apply under the `md` breakpoint (under 768px). **Do not change the desktop layout.** Restore the exact current desktop classes with `md:` overrides, and compare desktop screenshots (1280px) before and after.
- **Reuse existing pages, components, server actions and database functions.** This file is a UI spec. Add backend changes only where a step below says so, and keep them as small as possible.
- Placeholder data in the design (names, amounts, references, QR, policy wording) is sample content. Use real data.
- Brand tokens: primary `#0A47B1`, dark `#0A3D91`, light `#EAF4FF` / `#F3F9FF`, text `#0F2342`, muted `#5B6F89`, borders `#E3EEF9` / `#D6E6F7`; success `#E3F7EA` / `#12703A`; warning `#FFF2D6` / `#8A5A00`; danger `#FDE8E8` / `#A12A2A`. Inter for headings, Work Sans for body. Use existing shadcn components.
- Next.js 16 here has breaking changes. Read the relevant guide in `node_modules/next/dist/docs/` before changing routes or server actions.
- Related specs, apply them in this order if they are not built yet: `kuyog-bohol-testing-fixes-plan.md`, `kuyog-bohol-qr-payment-hardening.md` with `kuyog-bohol-hardening-followup-fix.md`, `kuyog-bohol-pickup-pass-qr.md`, `kuyog-bohol-ratings-and-reviews.md`, `kuyog-bohol-booking-abuse-protection.md`, `kuyog-bohol-profile-mobile-ui.md`. Where a related spec already built a piece, reuse it instead of building another.

## 0. Look at the code first and report

Open and report before coding (paths are from the Nov 18 snapshot, so verify): `app/cars/[id]/page.tsx`, `app/account/bookings/page.tsx`, `components/customer/booking-list.tsx`, `app/account/bookings/[id]/pay/page.tsx`, `components/customer/payment-proof-form.tsx`, `components/customer/profile-editor.tsx`, and which of the Planned items already exist.

## Shared mobile pieces

1. **Step header:** the "STEP N OF 9" label with its numbered circle and Live/Planned tag exists in the design board for review only. **Do not build it into the app.**
2. **Progress stepper** on steps 4 to 7: Request, Pay deposit, Owner confirms, Pickup. Derive the active step from the booking status: `awaiting_payment` = Pay deposit, `payment_review` / `pending` = Owner confirms, `confirmed` / `picked_up` = Pickup.
3. **Status chip** component used on every booking: `awaiting_payment` "To pay" (warning), `payment_review` "Payment review" (light blue), `pending` "Waiting for owner" (light blue), `confirmed` "Confirmed" (success), `picked_up` "On the road" (light blue), `returned` "Returned" (grey), `completed` "Completed" (grey), `cancelled` / `rejected` / `expired` (danger).
4. **CopyButton:** copies text, shows "Copied" for 2 seconds, `aria-label` set. Reuse the one from the testing-fixes plan if it exists.
5. **SubmitButton:** spinner and disabled state while a request runs. Reuse `components/loading/SubmitButton.tsx`.
6. **Friendly errors:** never show raw database or storage text.
7. Buttons are 52px high and fully rounded for primary actions; touch targets are at least 44px; no horizontal scroll at 360px and 390px.

## Step 1: Account (Live)

Profile and documents screen. **Build it as in `kuyog-bohol-profile-mobile-ui.md`.** Required here: after saving, call `router.refresh()` and show "Saved" so the page updates without a manual reload.

## Step 2: Vehicle page (Live, needs fix)

File: `app/cars/[id]/page.tsx` and its booking card.
1. Mobile layout: photo, name and meta, price per day, mode tabs (Self-drive, With driver), date card, booking summary card, primary **Request this car** button, and the line "You will not be charged yet."
2. Booking summary rows: days × rate, **Reservation deposit** (percent from the owner's setting, default 30%), **Balance at pickup**, and the refundable **Safety deposit** (self-drive only, from `car_rates.deposit_amount`). Show only rows that apply.
3. **Fix:** the **Update dates** button must not scroll the page to the top. Today it submits a GET form and reloads. Keep the page position (use `scroll={false}` on navigation or `router.replace(..., { scroll: false })`, or keep the date card in view by anchoring to its id). After updating, the visible area stays on the date and summary card.
4. The **Request this car** button now opens the cancellation policy dialog (step 3) instead of submitting immediately.

## Step 3: Cancellation policy dialog (Planned)

1. A shadcn `Dialog` (bottom sheet on mobile) opened by **Request this car**. Title "Cancellation policy", a short intro, three rows with icons (free cancellation window, deposit may be kept after that, repeated cancellations or no-shows can pause booking access), a required checkbox "I have read and accept the cancellation policy.", the primary **Accept and continue**, and a secondary **Back**.
2. **Accept and continue** is disabled until the checkbox is ticked, then runs the existing booking request action with a loading state.
3. **Policy wording:** read the values from settings, do not hardcode. Use `app_settings` keys `cancellation_free_hours` (default 48) and `cancellation_policy_text` (optional override). If settings storage differs, follow the existing pattern. Jabez will confirm the final wording; keep a single place to edit it.
4. **Store the acceptance** for evidence (small migration, safe to run twice):
   ```sql
   alter table public.bookings
     add column if not exists policy_accepted_at timestamptz,
     add column if not exists policy_version text;
   ```
   Set both inside the booking request server action, not from the client alone. Do not block old bookings that have no value.
5. Accessibility: focus moves into the dialog, `Esc` closes it, the checkbox has a label, and focus returns to the button on close.

## Step 4: Pay deposit (Live)

File: `app/account/bookings/[id]/pay/page.tsx`, `components/customer/payment-proof-form.tsx`.
1. Mobile layout: stepper, blue **Amount to pay** card (amount, time left to pay, **Copy amount**), owner QR card (owner name and masked number, **Download QR**), **How to pay** card (3 steps and a **Copy** for the booking reference), and the **Send proof** card (reference number input, screenshot upload, **Send proof** button).
2. **Send proof** shows a spinner and stays disabled while sending. The page then shows the status of step 5. Two quick taps must not create two proofs.
3. If the QR payment hardening spec already built a version of this page, only add what is missing (copy amount, copy reference, QR download, countdown).
4. Show the amount and reference exactly as the owner will compare them. Do not show raw errors.

## Step 5: Waiting for owner (Live)

1. After a proof is sent: a status card "Payment sent for review" with the owner's response deadline, a "What you sent" card (amount, GCash reference, booking reference with **Copy**), and a danger-outline **Cancel booking** button (existing `cancel_booking`, with a confirm dialog).
2. **Owner not responding?** card with **I paid but it is not confirmed**. Show it only after the review deadline passes. It should use the dispute or admin-flag function from the hardening spec if it exists. If it does not exist yet, hide this card; do not invent a backend.
3. Poll the booking status every 15 to 30 seconds (or use Supabase realtime if already used) so the page switches to step 6 by itself when the owner confirms.

## Step 6: Confirmed (Live, needs fix)

1. Mobile layout: green **Payment confirmed** card, **Your trip** card (car, dates, paid reservation, balance at pickup, safety deposit), **Pickup** card (what to bring, meeting point, **Message owner**, **Directions**), primary **Show my pickup pass** (step 7), and **Download receipt**.
2. **Fix:** a booking whose payment is recorded must never show the "To Pay" error. When the booking is `confirmed` or the payment is `verified`, the pay page redirects to this view, and a late click on **Send proof** shows a friendly "Payment already confirmed" message (see item B5 in `kuyog-bohol-testing-fixes-plan.md`).
3. **Show my pickup pass** only if the pickup pass module is built. Otherwise hide the button.
4. **Download receipt** is **Planned**. If a receipt feature does not exist yet, hide the button. Do not build the receipt here.

## Step 7: Pickup pass (Planned)

Build exactly as described in `kuyog-bohol-pickup-pass-qr.md` (tables, RPCs, QR style, `/p/[token]`, owner scanner). Mobile layout here: stepper, "Valid for pickup" chip, QR (216px, styled as specified), 6-digit **Backup code**, booking card (reference, car, pickup time), an "At pickup" info card (owner scans, checks ID, collects the balance and safety deposit, marks the car picked up), and **Get a new code**. The pass shows no personal details to anyone who scans it.

## Step 8: My bookings (Live, needs fix)

File: `app/account/bookings/page.tsx`, `components/customer/booking-list.tsx`.
1. Mobile layout: title, filter chips (All, Upcoming, Past), booking cards. Each card: car name, dates, status chip, booking reference with **Copy**, and one contextual action on the right.
2. Contextual action by status: "Pay ₱X →" for `awaiting_payment`, no action for `payment_review`, "Pickup pass →" for `confirmed` (only if step 7 exists), "Rate trip →" for `completed` and not yet reviewed (only if step 9 exists), none for the others.
3. **Fix:** "Pay" must open the pay page without an error. If the booking already has a pending or verified payment, open the status view instead. Use the B5 notes in the testing-fixes plan.
4. Counts shown on Profile Home ("1 to pay · 1 upcoming") use the same query.

## Step 9: Rate your trip (Planned)

Build as described in `kuyog-bohol-ratings-and-reviews.md`. Mobile layout: trip card, overall star rating (5 large tappable stars, with a label such as "Great"), quick tag chips (Clean car, On time, Fair price, Easy pickup), optional short review text, **Submit review**, and the note "You can edit your review for 7 days. Owners can reply once." Use the edit window and reply rules from that spec if they differ.

## Build order

1. Shared pieces (status chip, CopyButton, SubmitButton, friendly errors).
2. Step 2 fixes, Step 4, Step 5, Step 6, Step 8 (already built flows).
3. Step 3 (dialog and acceptance columns).
4. Step 1 (via the profile spec).
5. Steps 7 and 9 (only after their own specs are built).

## Tests

1. At 390px, walk the whole journey: request a car, accept the policy, pay, send proof, owner confirms, see the confirmed view.
2. **Update dates** keeps the scroll position.
3. **Request this car** opens the dialog. **Accept and continue** is disabled until the box is checked. The booking stores `policy_accepted_at`.
4. Every button shows a spinner while working, and double taps create only one booking and one proof.
5. A confirmed booking never shows the "To Pay" error. A rejected proof lets the customer submit again.
6. The pay page switches to **Payment confirmed** by itself when the owner confirms.
7. The My bookings chips and actions match the status table above; **Copy** works for the booking reference.
8. At 1280px the desktop pages look **exactly the same as before** (compare screenshots).
9. `npm run lint`, `npx tsc --noEmit`, `npm run build`.

## Out of scope

Desktop layouts, the owner side, admin screens, receipts, new payment methods.

## Codex prompt

*"Read `kuyog-bohol-booking-flow-mobile-ui.md`. First report the current booking, pay and account files and which related specs are already built. Then implement the mobile-only UI for steps 1, 2, 3, 4, 5, 6 and 8, using Tailwind classes that apply under the `md` breakpoint only and reusing existing components and actions. Add only the `policy_accepted_at` and `policy_version` columns for step 3. Build steps 7 and 9 only if their specs are already applied; otherwise hide their buttons. Do not change the desktop layout. Run lint, typecheck and build, compare desktop screenshots before and after, and list anything you could not verify."*
