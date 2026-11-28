# Kuyog Bohol — First-Time Onboarding for Owners and Customers (Instructions for Codex)

Designs are on the design canvas, row "First-time onboarding": **Owner setup checklist**, **checklist waiting for review**, **setup complete**, **first-visit tour step 1**, **tour last step**, **More, Help and guides**, **Customer "Book in 3 steps"**, **customer payment tip**, **customer pickup pass tip** (all mobile), and **owner checklist**, **owner tour dialog**, **customer "Book in 3 steps"** (desktop).

> Next.js 16 here has breaking changes. Read the relevant guide in `node_modules/next/dist/docs/` before changing layouts, routes or data fetching.

## Rules
- **UI only.** No changes to booking, payment, credits, commission, pickup or agreement logic. The checklist only **reads** data the app already has.
- Everything is **skippable and never blocks** the app. No forced tours before a booking. The partner agreement gate stays as it is.
- Reuse existing components, `lib/alerts` and the brand tokens: primary `#0A47B1`, dark `#0A3D91`, light `#EAF4FF` / `#F3F9FF`, text `#0F2342`, muted `#5B6F89`, borders `#E3EEF9` / `#D6E6F7`, success `#12703A` on `#E3F7EA`, warning `#8A5A00` on `#FFF2D6`. Inter headings, Work Sans body.
- English and Bisaya, with the same toggle pattern as the partner agreement (`lib/owner-agreement.ts` style: one content file, no copy inside components).
- Accessibility: 44px touch targets, visible focus rings, `aria-label` on icon-only buttons, dialogs are real dialogs (focus trap, `Esc` closes, focus returns), the progress bar has `role="progressbar"` with `aria-valuenow`, `prefers-reduced-motion` respected, text 13px or larger.
- Do not add a tour library. Build with the existing UI components.

## 0. Look at the code first and report
Open `app/owner/layout.tsx`, the owner dashboard page and `components/owner/*`, the owner shell and "More" menu, `app/owner/agreement`, owner credits, vehicles and QR settings pages, how `payment_qr_verified` and `owners.is_active` are stored, `min_credit_to_list` in settings, the customer home page, the booking payment step, the pickup pass page, and any existing localStorage usage. Report where each checklist condition can already be read and what is missing. Report differences from this file before coding.

## 1. Owner setup checklist (dashboard)
Boards: *owner setup checklist (mobile)*, *checklist waiting for review (mobile)*, *setup complete (mobile)*, *owner checklist (desktop)*.

Shown on the owner dashboard (above the stats) until all items are done or the owner hides it.

| # | Item | Done when (read-only) | Action |
|---|---|---|---|
| 1 | Accept the partner agreement | `owners.agreement_version` is the current version | link `/owner/agreement` |
| 2 | Add your payment QR | a payment QR is uploaded and `payment_qr_verified` is true | link to payment settings |
| 3 | Add your first vehicle | at least one non-archived vehicle with 3 or more photos and a rate | link to add vehicle |
| 4 | Top up starting credits | fee mode is `invoice`, or available credits are at or above `min_credit_to_list` | link `/owner/credits` (top-up) |
| 5 | Learn to confirm a deposit | the owner opened the "Confirm a deposit" guide or finished the tour | opens the guide |

Rules:
- **States per row:** done (green check, struck title), current (the first not-done, unlocked item: light-blue highlight and a **Start** button), todo (outlined circle and text link), **in review** (amber clock, "Sent for review. We'll notify you.", when a QR was uploaded but not verified), **locked** (dashed circle, "Opens after your QR is verified", for items 3 and 4 while the QR is not verified; do not lock if the current app already lets them do it).
- Header: "Finish setting up", subtitle "Takes about 10 minutes. You can stop and come back.", chip "{n} of 5 done", and a 5-segment progress bar (`role="progressbar"`).
- **Hide for now** hides it for this session/device and it returns on the next login while any item is open. Once all items are done, show the **setup complete** card once ("You're ready for bookings", button **View my vehicles**, **Dismiss**), then never show the checklist again.
- Items update automatically from live data on each dashboard load; do not store the five statuses. Only store: `onboarding_dismissed_at` and `guide_confirm_deposit_seen_at` (see section 5).
- The dashboard stat cards and the rest of the dashboard stay exactly as they are.
- Admin can still hide vehicles and set credits; the checklist never contradicts the real listing state (use the same listing check the public site uses, and do not duplicate its logic: call it).
- Archived owners and owners who have not accepted the agreement do not see the checklist (they already hit the agreement gate).

## 2. Owner first-visit quick tour
Boards: *first-visit tour, step 1*, *tour last step* (mobile), *owner tour dialog* (desktop).
- Four cards, shown **once** on the first dashboard visit after the agreement is accepted: 1 How a booking works (three-step visual), 2 Pay the platform fee (credits or invoice, ₱ minimum read from settings), 3 Pickup pass and ID check, 4 **Confirm before the deadline** (deposit card with time-left chip). Mobile: full-width bottom sheet below the top bar. Desktop: centered 560px dialog.
- Controls: **Skip** (top right, always), **Back** (disabled on card 1), **Next**, last card **Start setup**. Dots show progress. Closing the tour by any route marks it seen.
- Finishing the tour (reaching card 4) also marks the "Learn to confirm a deposit" checklist item done.
- Do not start the tour over another dialog (agreement gate, credits sheet). Start it only when the dashboard is visible and nothing else is open.
- Copy comes from one content file, English and Bisaya. Amounts and the deadline wording are read from settings, never hard-coded in components.

## 3. Owner Help and guides
Board: *More, Help and guides (mobile)*.
- New page `/owner/help` linked from More (and a "Help" item in the desktop sidebar). Header "Help and guides", subtitle "Short guides for owners.", language toggle English / Bisaya.
- Guide rows (title, reading time, optional chip): How a booking works (1 min), **Confirm a deposit** (1 min, chip "Important"), Scan the pickup pass (1 min), How credits work (2 min), Add or edit a vehicle (2 min), Contact support (the support email from existing settings).
- Each guide opens a simple page or an in-page accordion with 3 to 5 short steps. Reuse the existing "How credits work" copy and the agreement points where they match; do not duplicate legal wording.
- **Replay the quick tour** row below the list.
- Opening **Confirm a deposit** sets `guide_confirm_deposit_seen_at`.

## 4. Customer tips (keep them nearly invisible)
Boards: *customer "Book in 3 steps" (mobile and desktop)*, *customer payment tip*, *customer pickup pass tip*.
1. **Book in 3 steps** card on the public home page, between the search box and the vehicle list: "Pick your dates", "Pay the deposit", "Show your pass". Dismiss button (X, 44px). Desktop: one row of three. Do not block search, and do not show it to logged-in customers who already have a booking.
2. **Payment tip** on the payment step, the first time only: dark-blue tip below the QR card, "Pay, then upload your proof. The owner checks it and confirms. Your dates are held until then." Buttons **Got it** and **Don't show tips**.
3. **Pickup pass tip** the first time the customer opens a confirmed pass: "Show this at pickup. Show this QR with a valid ID. The owner scans it to hand over the vehicle."
- Tips are small popovers with an arrow, not full-screen. They never cover the primary action or the QR a customer needs to scan, and they auto-position (below or above the target on small screens). No tip appears while an error, loading state or other dialog is open.
- Dismissal is stored in `localStorage` per device (wrap every read and write in try/catch; the app must work with storage blocked). Logged-in customers may optionally also store it on the profile, but this is not required.
- **Don't show tips** turns off all customer tips on this device.

## 5. Storage
One migration, small:
- `owners`: add `onboarding_dismissed_at timestamptz`, `onboarding_tour_seen_at timestamptz`, `guide_confirm_deposit_seen_at timestamptz`.
- One `security definer` function `public.mark_owner_onboarding(p_key text)` with `set search_path = ''`: accepted keys are `dismissed`, `tour_seen`, `guide_confirm_deposit`; finds the caller's owner row by `profile_id = auth.uid()`; sets only the matching column to `now()` if null; rejects any other key and any caller without an owner row. Grant execute to `authenticated` only. No audit entry (not sensitive).
- Owners must not be able to write these columns by any other route; confirm the existing owner update policy and block the three columns if needed, the same way the agreement columns are protected.
- Follow the repo's migration naming and RLS rules; do not touch other functions or policies.

## 6. Loading, empty and error states
- The checklist shows a skeleton card while its data loads. If one condition cannot be read, show that row as todo without a status and log the error server-side (no personal data). Never break the dashboard.
- If `mark_owner_onboarding` fails, ignore it silently (the tour may show again next visit) and log it.
- Slow connection: follow `kuyog-bohol-connection-states.md`; tours and tips never need the network after the page has loaded.

## 7. Tests
1. New owner (agreement accepted, nothing else): checklist shows 1 of 5, current item is the payment QR step, items 3 and 4 follow the real rules. The quick tour shows once, then never again.
2. Upload a QR: row shows "in review", Start is not offered; when admin verifies, it turns done on the next load.
3. Add a vehicle with fewer than 3 photos: row stays not done. Add the third photo: done.
4. Credits: below `min_credit_to_list` row is todo; at or above, or fee mode invoice, done. Change the setting and confirm the checklist follows it.
5. Complete all items: the setup complete card shows once, Dismiss hides it, and a reload does not bring it back.
6. Hide for now hides it for the session and it returns after the next login while open.
7. Tour: Skip at any card marks it seen; Back and Next work; `Esc` closes; focus returns to the dashboard; not shown over the agreement gate.
8. Help page: language toggle works; all six guides open; **Confirm a deposit** marks the checklist item done.
9. Customer: home strip dismisses and stays dismissed; payment tip and pickup tip show once; **Don't show tips** stops both; with `localStorage` blocked the app works and tips simply show each time.
10. An owner cannot set the onboarding columns directly via the Supabase client; other owners' rows cannot be changed with the function.
11. 360px: nothing hidden behind the bottom bar, no horizontal scroll, text 13px or larger. Keyboard and screen reader: progress bar announced, dialogs trap focus, all buttons reachable.
12. `npm run lint`, `npx tsc --noEmit`, `npm run build`.

## Out of scope
Interactive product tours with element highlighting, video guides, analytics or funnels, email onboarding sequences, onboarding for admin, gamification, changes to listing rules or credit minimums.

## Codex prompt
*"Read `kuyog-bohol-onboarding.md`. First report how the owner dashboard, owner shell and More menu, partner agreement gate, QR verification, vehicles, credits, customer home, payment step and pickup pass pages work today, and where each checklist condition can be read. Then implement the owner setup checklist, the first-visit quick tour, the Help and guides page, the customer tips, and the small onboarding migration with `mark_owner_onboarding`, in English and Bisaya, as described. Add no booking, payment, credit or pickup logic changes, never block any flow, and keep every state readable from live data. Run lint, typecheck and build, run the tests in section 7, and list anything you could not verify."*
