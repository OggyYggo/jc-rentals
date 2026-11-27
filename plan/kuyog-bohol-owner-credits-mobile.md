# Kuyog Bohol — Owner Workspace: Credits Page Redesign, Mobile (Instructions for Codex)

Why: owners find the credits page confusing. Verified problems in the current code (`app/owner/credits/page.tsx`, `components/owner/credits.tsx`, `components/owner/credit-state.tsx`, `components/owner/online-topup.tsx`):
1. The **manual QR form comes first** (QR image, amount, reference, proof upload) and **Pay online is tucked underneath it**, so the fastest option is the last thing an owner sees.
2. The balance appears **twice** (`CreditBanner`, then the "Available credits" card) with **three different numbers** (Available, Balance, Pending fees) that are never explained.
3. Nothing explains **what credits are for**, what the 5% fee is, or that **vehicles are hidden below the minimum** (that warning only shows deep in the card).
4. The activity list shows raw database words ("booking fee", "topup", "fee refund") and raw status ("pending", "posted"), with no booking reference or vehicle.
5. The online result card says only "Waiting for confirmation" with the order code.
6. Invoices are a plain list at the bottom with no "amount due" summary.

Designs (mobile) are on the design canvas, row "Owner credits redesign": boards **Credits: home**, **Credits: low balance**, **Credits: no credits, new owner**, **Credits: invoices (invoice owners)**, **Credits: top up, choose amount and method**, **Credits: online payment result states**, **Credits: pay by QR and upload proof**.

> Next.js 16 here has breaking changes. Read the relevant guide in `node_modules/next/dist/docs/` before changing routes, layouts or data fetching.

## Rules
- **Mobile only (below `lg`).** The desktop credits page (`lg` and up) must look and behave exactly as today. Render the new mobile layout in `lg:hidden` blocks and wrap the current desktop content in `hidden lg:block`. Compare 1280px screenshots before and after.
- **No business-logic, payment, database or RPC changes.** Same tables, same `owner_credit_state`, same manual top-up insert and storage upload, same `/api/payments/topup/create` call, same QuickPay webhook and status logic. Extra display data must come from small extra selects on the existing client/server Supabase client (list each in your report).
- Brand tokens: primary `#0A47B1`, dark `#0A3D91`, light `#EAF4FF` / `#F3F9FF`, text `#0F2342`, muted `#5B6F89`, borders `#E3EEF9` / `#D6E6F7`, success `#12703A` on `#E3F7EA`, warning `#8A5A00` on `#FFF2D6`, danger `#A12A2A` on `#FDE8E8`. Inter for headings, Work Sans for body.
- Accessibility: 44px minimum touch targets, visible focus rings, radio options are real `role="radiogroup"`/`radio` controls, the "How credits work" panel is a `<details>`/disclosure with `aria-expanded`, `role="status"` on the online result, amounts never truncated, money via the existing `paymentPeso`.
- Plain words. No database terms on screen. Sentences under about 15 words.

## 0. Look at the code first and report
Open the four files above, `lib/payments/quickpay.ts` (`minimumTopup`, `maximumTopup`, `quickpayConfig`, `orderPattern`), the SQL for `owner_credit_state` and `owner_can_accept` (migration `202611060003_payment_qr_module.sql`, around line 134), `app/owner/layout.tsx` and the owner shell (the **More** menu has Credits under Money), how invoice-mode owners pay their invoices today (the page only lists `commission_invoices`; report what exists, do not invent a pay flow), and where else `/owner/credits#top-up` is linked (dashboard credits row, banner). Confirm: how the minimum listing balance is applied (is the vehicle hidden when `available < min_credit_to_list`?), whether the fee rate shown to owners should come from the owner's own commission rate or plan, and whether owners can read `bookings` (reference, vehicle) through RLS for the activity list. Report anything that differs from this file.

## 1. Credits home (`/owner/credits`, mobile)
Top to bottom (board "Credits: home"):
1. Back link "Money" (history back, fallback `/owner`), h1 **Credits**, one line "Prepaid balance for platform fees."
2. **Balance card** (replaces `CreditBanner` and the old balance card on mobile):
   - Label "Available credits", big amount = `credit_state.available`.
   - One line: "Balance {balance} · {pending_fees} held for pending bookings" (same numbers as today, now explained in words). Hide the "held" part when `pending_fees` is 0.
   - **Status bar and sentence** from the same rule that decides whether vehicles are listed (`available` vs `min_credit_to_list`):
     - OK: blue card, full bar, "Your vehicles are visible to customers".
     - Low (available ≥ minimum but under `low_threshold`) or below minimum: amber card with a "Low" chip, bar showing `available / minimum`, sentence "{minimum − available} more keeps your vehicles listed (minimum {minimum})."
     - Zero or below minimum and vehicles hidden: amber/red "No credits" chip, "Your vehicles are hidden. Add at least {minimum} to list them again."
   - Full-width primary **+ Top up credits** (52px) to `/owner/credits/top-up`. Any `#top-up` link on mobile also goes there (see section 3).
3. **How credits work**: collapsed disclosure by default (open by default when the owner has no activity or no credits). Three numbered lines: "Each confirmed booking uses {rate}% of its price as the platform fee." / "The fee is held while a booking waits for confirmation." / "Keep at least {minimum} so your vehicles stay listed." Use the owner's real rate and the real minimum, never hard-coded 5% or ₱500.
4. **Waiting top-up notice**, when a manual top-up has `status = 'pending'`: amber card "Top-up waiting for review" with amount and "sent {date and time}" and "Usually reviewed the same day." (use the existing ledger rows; no new query). Same for a QuickPay order in status `created` created in the last 2 hours: "Online payment not finished" with a link back to its status view.
5. **Activity**: heading, filter chips **All / Top-ups / Fees** (client-side filter of the rows already loaded, no URL change), grouped by month (uppercase month label), card with rows (icon tile, title, subtitle, amount right, small status chip). Mapping from the ledger (never show raw words):
   | type / status | Title | Subtitle | Amount | Chip |
   |---|---|---|---|---|
   | topup, posted, from an online order (a `gateway_topups` row has this `ledger_id` or note starts with "Online top-up") | Top-up added | "Online · {channel label} · {date time}" | +amount (green) | Added |
   | topup, posted, manual | Top-up added | "QR payment · {date}" | +amount | Added |
   | topup, pending | Top-up waiting | "QR + proof · {date}" | +amount (amber) | Waiting |
   | topup, rejected | Top-up not approved | "{short reason if present}, {date}" | amount struck through or muted | Not approved (red) |
   | booking_fee | Platform fee | "{booking reference} · {vehicle} · {date}" | −amount | none |
   | fee_refund | Fee refunded | "{booking reference} cancelled · {date}" | +amount (green) | none |
   | adjustment | Adjustment | "{note or Admin adjustment} · {date}" | ±amount | none |
   Fetch the booking reference and vehicle name for fee rows with one extra select on the same ledger query (foreign-table select on `booking_id`, for example `bookings(reference, cars(name))`); if it is not allowed by RLS or fails, fall back to the subtitle date only and log server-side.
   Show the 20 most recent rows and a **Show earlier months** button that loads more (client pagination of the already loaded rows is fine, or a `limit` with "Show more"). Empty state: dashed card with wallet icon, "No activity yet", "Top-ups and platform fees will show here."
6. Invoice-mode owners (`owner.fee_mode === "invoice"`): do not show the credits balance card or the top-up button. Show the **Invoices** layout (section 5) as the page.
7. Remove on mobile: the duplicate banner, the "Credits and invoices" description sentence, the inline QR form, and the inline "Pay online" card (both move to the top-up flow).

## 2. Low and no-credit states
Board "Credits: low balance" and "Credits: no credits, new owner". Same layout; the card turns amber with the sentences above and "How credits work" opens by default. A brand-new owner (no ledger rows) sees the no-credits card, the open explainer and the empty activity state.

## 3. Top up flow (mobile only; on `lg` these routes redirect to `/owner/credits#top-up` so desktop is unchanged)
**Route `/owner/credits/top-up`** (board "Credits: top up, choose amount and method"). Back link "Credits". h1 "Top up credits", line "Choose an amount and how to pay."
1. **Amount:** chips ₱500 / ₱1,000 / ₱2,000 / **Other** (numeric whole-peso input, `inputMode="numeric"`). Validate against the existing limits: online uses `minimumTopup` to `maximumTopup`; manual keeps its existing validation (amount greater than 0, same as today). A small card shows "Your balance after top-up" = available + amount.
2. **How to pay** (radio cards):
   - **Pay online** (tag "Fastest", selected by default): "GCash, Maya, GoTyme or bank. Credits are added in about a minute." Inside the selected card: "Pay with" chips GCash / Maya / GoTyme / Other (Other sends no channel, as today). Only show this card when `quickpayConfig()` is set; if not, show only the QR option, with no radio choice.
   - **Scan QR and upload proof** (tag "Same day"): "Pay our QR, then send your reference and screenshot. Credits are added after review."
3. Primary **Continue to payment** (54px). Online: call the existing `POST /api/payments/topup/create` exactly as `OnlineTopup` does and redirect to the returned `url`; show its friendly errors inline (`role="alert"`) and keep the button spinner/disabled behavior. QR: go to `/owner/credits/top-up/qr?amount={n}`.
4. Reassurance line: "Secure payment. We never see your card or wallet PIN." (Only keep this line if it stays true: payment happens on QuickPay's page for online; for QR the owner pays in their own app. If you are unsure, shorten to "Payments are processed securely.")

**Route `/owner/credits/top-up/qr`** (board "Credits: pay by QR and upload proof"). Three-segment progress bar, **1 · Scan and pay {amount}**: signed platform QR image (existing `qrUrl`, same 300-second signed URL), account name, "GCash, Maya or any QR Ph app". **2 · Send your proof:** amount paid (prefilled, editable), reference number, screenshot picker with thumbnail and "Change photo". Primary **Submit for review** runs the **existing** submit logic unchanged (upload to `topup-proofs`, insert pending ledger row, remove the file if the insert fails, same validation messages, same `runWithAlerts` success "Top-up sent for review"), then returns to `/owner/credits` where the "Top-up waiting for review" notice now shows. Move the existing submit code into a shared client function so desktop and mobile use the same one. Note under the button: "Credits are added after we check it, usually the same day." If the platform QR is missing, show "Payment QR is not available yet. Contact support." and keep the form disabled.

## 4. Online payment result (`/owner/credits?topup={orderId}`, mobile)
Replace the one-line `OnlineTopupStatus` card on mobile with the cards in board "Credits: online payment result states", keeping the same data source, the same 5-second refresh for up to 2 minutes, and `role="status"`:
- `created` (waiting): "Waiting for confirmation", "This usually takes under a minute. You can leave this page.", chip with amount · channel · order code, **Back to credits**.
- `paid`: "{amount} added", "New balance {available}. Your vehicles are visible." (second sentence only when the owner is now above the listing minimum), **Done**.
- `failed` / `expired`: "Payment not completed", "This payment was not finished. You have not been charged." Buttons **Try again** (to `/owner/credits/top-up`) and **Pay by QR instead** (to the QR route).
- `needs_review`: "We're checking your payment", "We received your payment and are confirming it. Credits are added once it is confirmed.", **Back to credits**. (This state is missing from the design board; use the amber style of the waiting card.)
- Footer line on all non-paid states: "Paid but no credits after 10 minutes? Contact support with your order number." with a link to `/contact`, and the order code copyable.
Do not claim "No money was taken" unless the status guarantees it; use the wording above.

## 5. Invoices (invoice-mode owners; board "Credits: invoices")
Page title **Invoices**, line "Monthly platform fees for your bookings." Summary card: "Amount due" = sum of `commission_due` for invoices that are not paid, with "Due {earliest due date} · {n} days left" (amber; red when overdue). Then one card per invoice: month name, due or paid date, status chip (Due, Overdue, Paid), amount, and the existing details (for example bookings count and total if already available on the invoice row; hide if not). Footer: "Invoice owners are billed monthly. Credits are not used." **Do not add a pay button or any payment flow**; if the current app has none, report how invoices are paid today so Jabez can decide separately. Credits-mode owners who have old invoices see a "View invoices" link below the activity list opening the same view.

## 6. States, copy, performance
- Loading: keep `instant = false` behavior; add a mobile skeleton (balance card, 3 activity rows).
- Errors: if the load fails keep the current error boundary; if only the booking-reference select fails, still render activity without references.
- Dates in Asia/Manila, formatted like "Nov 27, 2:16 PM" (use the helpers already in the repo).
- Update the dashboard credits row and any "Top up" link on mobile to go to `/owner/credits/top-up`; desktop links keep `#top-up`.

## 7. Tests
1. At 390px the Credits page shows, in order: balance card, How credits work, activity; no QR form and no duplicated balance. At 1280px it is pixel-identical to before.
2. Balance sentences match the real minimum and status: above minimum (visible), between minimum and low threshold (Low), below minimum (hidden), and zero.
3. Every activity type renders with plain titles, correct sign and colour, booking reference and vehicle where available, and no raw words ("booking_fee", "posted").
4. Filters All / Top-ups / Fees work; months group correctly in Manila time; empty state shows for a new owner.
5. Top-up chooser: amount validation (online limits), balance-after math, online option hidden when QuickPay is not configured, Continue redirects to the QuickPay URL, errors show inline.
6. QR flow: existing validation messages, upload and insert behavior unchanged, failed insert removes the file, pending notice appears afterwards.
7. Online result states for `created`, `paid`, `failed`, `expired`, `needs_review`, including the 2-minute auto-refresh and no credit change from visiting the page.
8. Invoice-mode owner sees Invoices, no top-up button; amounts due match `commission_invoices`.
9. On `lg`, `/owner/credits/top-up` and `/qr` redirect to `/owner/credits#top-up`; the desktop page works exactly as before including its manual and online top-up.
10. Keyboard and screen reader pass (radio group, disclosure, chips, status announcements); no horizontal scroll at 360px; nothing hidden behind the bottom nav.
11. `npm run lint`, `npx tsc --noEmit`, `npm run build`.

## Out of scope
Changing fee rules, listing minimum, QuickPay logic, the admin Top-ups page, desktop layouts, a pay-invoice flow, push notification changes.

## Codex prompt
*"Read `kuyog-bohol-owner-credits-mobile.md`. First report how the owner credits page, credit state, online top-up and invoices work today, how the listing minimum is applied, whether the activity list can read booking reference and vehicle under RLS, and how invoice-mode owners pay. Then implement, mobile only, the redesigned Credits home (balance card with plain explanation, How credits work, plain-language grouped activity with filters), the two-step top-up flow (choose amount and method, then QuickPay redirect or the QR and proof form using the existing submit logic), the new online result states, and the Invoices view. Keep the desktop page, all payment and credit logic, database and RPCs unchanged, and do not invent a pay-invoice flow. Run lint, typecheck and build, run the tests in section 7, compare 1280px screenshots before and after, and list anything you could not verify."*
