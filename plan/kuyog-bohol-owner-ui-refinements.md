# Kuyog Bohol — Owner Side UI Refinements (Instructions for Codex)

Two refinements from Jabez's test notes (Nov 25):
1. **Owner side: the success page after scanning or typing a pickup pass needs a better design.**
2. **Owner side: the deposit review ("Pay deposit") screen has too much text.**

Designs (mobile) are on the design canvas: boards **"Owner: pickup success"**, **"Owner: deposits list"**, **"Owner: review deposit"**.

> Next.js 16 here has breaking changes. Read the relevant guide in `node_modules/next/dist/docs/` before changing routes or server actions.

## Rules
- **Mobile-first, and keep the desktop layout of these pages unchanged** unless a step says otherwise. Use Tailwind classes under the `md` breakpoint for the new layout and restore the exact current desktop classes with `md:` overrides. Compare desktop screenshots before and after.
- **Do not change any business logic, database function, payment rule or pickup rule.** This is a UI and copy change only. The same RPCs (`owner_confirm_pickup`, `owner_confirm_return`, `confirm_booking_payment`, `reject_booking_payment`) are called with the same arguments.
- Brand tokens: primary `#0A47B1`, dark `#0A3D91`, light `#EAF4FF` / `#F3F9FF`, text `#0F2342`, muted `#5B6F89`, borders `#E3EEF9` / `#D6E6F7`, success `#12703A` on `#E3F7EA`, warning `#8A5A00` on `#FFF2D6`, danger `#A12A2A` on `#FDE8E8`. Inter for headings, Work Sans for body.
- Keep accessibility: `role="status"` on success and match messages, `aria-live="polite"` on the match indicator, 44px minimum touch targets, visible focus rings.
- Buttons that save show a spinner and are disabled while working (reuse `SubmitButton`). Friendly messages only.
- Reuse the existing pieces: `components/pickup/PickupCheck.tsx`, `components/pickup/ScanPickupLink.tsx`, `components/owner/payment-review.tsx`, `components/owner/payment-queue-card.tsx`, `app/owner/payments/page.tsx`, `lib/payment-format.ts`.

## 0. Look at the code first and report
Open and confirm: `components/pickup/PickupCheck.tsx` (the `complete && !isReturn && !admin` branch is the current success page; the plain `complete` branch is used for returns and for admins), `components/owner/payment-review.tsx` (owner view when `admin` is false), `components/owner/payment-queue-card.tsx`, `app/owner/payments/page.tsx`, and where else `OwnerPaymentReview` is rendered (owner dashboard, booking workflow). Report anything that differs from this file before editing.

---

## 1. Pickup success page (owner, after a scan or a typed code)

File: `components/pickup/PickupCheck.tsx`, the `complete && !isReturn && !admin` branch. Used by `/owner/scan` and by the pickup dialog inside the bookings list (`onCancel` is set there).

### 1.1 Layout (mobile, top to bottom)
1. **Success mark:** a 88px green circle (`#12703A`) with a white check and a soft ring (`#E3F7EA`, 10px), centered. A short, one-time scale-in animation is fine; respect `prefers-reduced-motion`.
2. **Heading** "Vehicle handed over" (Inter, 28px, bold) and one line: "Booking is now **Picked up**" (the word in green). Remove the old dark green full-width banner.
3. **Who and what** card: customer initials avatar, customer name, "Vehicle label · plate", and a reference chip (for example `KB-7Q4M2`). Use `lookup.customer_name`, `lookup.vehicle_label`, `lookup.plate`, `lookup.reference`.
4. **Recorded today** card with rows (label left, value right):
   - **Balance collected:** `₱3,500 · Cash` when a balance was due and received (use the amount `balance` and the method the owner chose in the form, shown as Cash, GCash, Bank transfer or Other). If no balance was due, show `No balance due`.
   - **Safety deposit held:** show only for self-drive bookings with `deposit_amount > 0`, using `paymentPeso(lookup.deposit_amount)`. Hide the row otherwise.
   - **ID checked:** green check and "Yes".
5. **Return due** card with a calendar icon: `lookup.end_date` formatted (for example "Nov 30"). If the booking has a return or pickup time field available in `lookup`, add it ("Nov 30, 9:00 AM"); if there is none, show the date only. Do not fetch new data just for this.
6. **Buttons:** primary full-width **Scan another pass** (scan icon; use `onCancel` when set, otherwise `ScanPickupLink`), secondary full-width **View booking** (a link to the owner bookings list, or to the booking if the app already has a booking detail route for owners; otherwise keep `/owner/bookings`).
7. A small muted line at the bottom: "Saved {time} Manila time" using the current time at completion (`paymentDate(new Date().toISOString())` or the helper already used in the file).

### 1.2 Data
Keep the method and balance the owner entered in component state (`method`, `received`, `balance`) so the success card can show them after `setComplete(true)`. Do not read them back from the server. Nothing new is stored.

### 1.3 Behavior
- The success view replaces the form completely; focus moves to the heading so screen readers announce it.
- After success keep the existing `router.refresh()` behavior when `onCancel` is set.
- The **return** success view and the **admin** success view stay as they are, except you may apply the same simpler card styling to the return view if it takes under a few lines (optional; report what you did).
- Keep the error state of the form unchanged.

### 1.4 Tests
1. Scan a valid pass with a balance due: success page shows balance collected with the right method, safety deposit row for self-drive, and return date.
2. A booking with no balance due shows "No balance due".
3. A with-driver booking hides the safety-deposit row.
4. **Scan another pass** returns to the scanner (both on `/owner/scan` and in the bookings dialog); **View booking** works.
5. Admin pickup flow and return flow still show their existing success messages.
6. At 360px width there is no horizontal scroll; at 1280px the page looks fine and the scan page layout is unchanged.

---

## 2. Deposit review (owner) — much less text

Files: `components/owner/payment-review.tsx` (owner branch, `admin === false`), `components/owner/payment-queue-card.tsx`, `app/owner/payments/page.tsx`. **Do not change the admin layout** (`admin === true`) of `OwnerPaymentReview`; leave that branch exactly as it is.

### 2.1 What is wrong today (verified)
The owner card shows a lot at once: the booking reference, amount, a detail row with the full review deadline text plus time left and flag counts, a proof block with "Open payment proof", the transfer reference, a "Payment option" line (with the provider name repeated in brackets), the list of flags, a sentence "Enter the amount and reference from your GCash, Maya, or bank history.", two inputs, and two buttons. On a phone this is a long wall of small text.

### 2.2 List screen ("Owner: deposits list")
Show one compact card per deposit waiting for review:
- **Amount** (large, Inter 20px bold), under it `Car name · Booking reference`.
- A **time-left chip** on the right: amber `5h 12m left`; red when under 1 hour, and `Deadline passed` in red when it is over. Remove the long "Review by … Manila time" sentence from the list (keep the exact deadline inside the detail screen as a tooltip or small line).
- A row with a small colored provider tile (first letter) and the **payment option label** (for example "Maya", "GCash"). If the payment has flags, show one amber chip "1 flag" or "2 flags" at the right of that row. Hide the row's tile if no label exists.
- One full-width primary button **Review deposit** (height 46px).
- A section "Recently confirmed" below with up to 3 compact rows (amount, reference, car, date, green "Confirmed" chip), only if that data is already loaded by the page; if not, skip this section (do not add new queries here).
- Header: "Deposits" and a chip "{n} to review". Subtitle in one short line: "Check each payment in your app, then confirm."
- Empty state keeps the current component and message.

### 2.3 Detail screen ("Owner: review deposit")
Opens from **Review deposit**. Use a full-width bottom sheet or a dedicated page section on mobile; keep the current inline expand on desktop if that is how it works today. Content, in this order:
1. **Back** link ("Deposits").
2. **Amount card** (blue `#0A47B1`): "Deposit to confirm", the amount in large white text, the car and reference below, and the time-left chip on the right.
3. **Proof row:** a small proof thumbnail (84px) with the label "Customer's proof", the payment option name, "Ref {transfer reference}" and a **View proof →** link that opens the full image in a new tab (keep the signed URL logic exactly as is; keep the `noreferrer` link behavior). If the image is unavailable, show "Proof image unavailable" in muted text.
4. **What you received** card with two inputs (`Amount`, `Reference`), each with a right-side green check once it matches the customer's values. Show one live line under the inputs:
   - Match: green "Amount and reference match".
   - Mismatch (only after the owner typed something): amber "Check amount and reference" (no technical text).
   Reuse the existing `matches` computation (`Number` compare and `normalizePaymentReference`). Inputs keep `inputMode="decimal"` for the amount.
   **Remove** the sentence "Enter the amount and reference from your GCash, Maya, or bank history." The card title "What you received" replaces it.
5. **Flags:** if there are flags, one collapsed row "⚠ 1 flag · Show" that expands to the existing flag chips (flags still use `flag.replaceAll("_", " ")`). If none, show nothing.
6. **Buttons:** **Confirm payment** (green, full width, disabled until the values match and the deadline has not passed, as today) and **Reject proof** (outline, red text). Both keep their existing handlers (`review(payment, true|false)`), the confirm dialog, the reject reason dialog with the four choices, and the credits-short handling.
7. Remove from the owner view: the duplicate "Payment option · X (X)" wording, the separate "Transfer reference" paragraph (the reference now lives in the proof row), and the long deadline sentence (keep it only as a small muted line under the amount card: `Review by Nov 25, 6:00 PM`).

### 2.4 Copy rules for this screen
- Sentences of at most about 10 words; no paragraphs.
- No repeated information on the same screen (the reference and amount appear once).
- Keep the exact amounts and references; never shorten or truncate them.

### 2.5 Tests
1. A pending deposit shows as a compact card with amount, car, reference, time-left chip, provider tile and one button.
2. Flags appear as a single chip in the list and a collapsed row in the detail.
3. Matching amount and reference shows green checks and enables **Confirm payment**; a wrong amount or reference keeps it disabled and shows the amber hint.
4. After the deadline, the card shows "Deadline passed" and **Confirm payment** is disabled (unchanged behavior).
5. **Reject proof** still asks for a reason with the four choices.
6. Confirming with too few owner credits still shows the existing "Top up your owner credits" message and the booking stays in review.
7. The proof opens in a new tab; a missing proof shows the muted message.
8. Admin deposit review screens look and behave exactly as before.
9. At 360px: no horizontal scroll, every tap target at least 44px. At 1280px: the owner payments page looks as it did, apart from the shorter text.
10. `npm run lint`, `npx tsc --noEmit`, `npm run build`.

## Out of scope
Backend or database changes, new data fields, admin screens, customer screens, the refund and credits screens.

## Codex prompt

*"Read `kuyog-bohol-owner-ui-refinements.md`. First report the current success branch in `components/pickup/PickupCheck.tsx`, the owner branch of `components/owner/payment-review.tsx`, and where they are rendered. Then redesign (1) the owner pickup success page and (2) the owner deposit review (compact list cards plus a short detail view) exactly as described, mobile first, without changing desktop layouts, the admin branch, or any business logic or RPC arguments. Remove the extra text listed in section 2.3. Keep accessibility and loading states. Run lint, typecheck and build, run the tests in sections 1.4 and 2.5, and list anything you could not verify."*
