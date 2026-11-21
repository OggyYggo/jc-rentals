# Kuyog Bohol — Testing Fixes Plan (test notes of Nov 21, 2026)

**Repo:** `OggyYggo/jc-rentals` (Next.js 16 App Router, React 19, TypeScript, Tailwind 4, shadcn/ui, Supabase, Vercel). Suggested location in the repo: `plan/kuyog-bohol-testing-fixes-plan.md` (the repo already keeps plans there).
**Source:** Jabez's manual test of the customer and admin sides (list below). Every item was checked against the code. Nothing was run, and the live site was not tested.
**How to read the findings:** **Confirmed** = the code shows the cause. **Likely** = the code shows a plausible cause that must be reproduced. **Needs repro** = cannot be decided from the code alone.

> Next.js 16 here has breaking changes. Read the relevant guide in `node_modules/next/dist/docs/` before changing routes, server actions or caching code, and follow the repo's existing patterns.
> The code I read is the repo snapshot of **Nov 18**. If anything was pushed since, re-check each file named below before editing.

## 1. Summary

| # | Area | Test note | Finding | Main files |
|---|---|---|---|---|
| C1 | Customer · Profile | Page must refresh after submitting profile and documents | **Confirmed**: no `router.refresh()`, stale status and file inputs | `components/customer/profile-editor.tsx` |
| B1 | Customer · Booking | Cancellation policy pops up after "Request self-drive", with an Accept button | Not built; policy only exists on `/terms` | `app/cars/[id]/page.tsx`, `app/terms/page.tsx` |
| B2 | Customer · Booking | Request button has no loading indicator | **Confirmed**: plain `<button>` inside a server-action form | `app/cars/[id]/page.tsx` |
| B3 | Customer · Booking | After "Update dates" the page reloads to the top; should stay at Booking summary | **Confirmed**: plain GET form, full navigation | `app/cars/[id]/page.tsx` |
| B4 | Customer · Booking | Booking reference needs a Copy button | Not built | `components/customer/booking-list.tsx`, pay page |
| B5 | Customer · To Pay | Error shown to the customer even though the owner received the deposit and the booking is confirmed | **Likely** (three code paths, section 3.5) + **Needs repro** | `components/customer/payment-proof-form.tsx`, pay page, payments migration |
| A1 | Admin · Customers | Documents and ID must open for viewing, not download | **Likely**: opens a raw signed URL; behavior depends on the file's stored type | `components/admin/customer-manager.tsx` |
| A2 | Admin · Customers | Review button seems not clickable | **Likely**: buttons are disabled with no reason shown and are tiny | `components/admin/customer-manager.tsx` |
| A3 | Admin · Dashboard | Cards must be clickable | **Confirmed**: `AdminStat` renders a non-link `<article>` | `components/admin/ui.tsx`, `app/admin/page.tsx` |

Do the items in the order of section 5.

## 2. Shared pieces (build once, reuse)

1. **`components/ui/CopyButton.tsx`** (client): props `value`, `label` (default "Copy"), `copiedLabel` ("Copied"). Uses `navigator.clipboard.writeText` with a `document.execCommand("copy")` fallback inside try/catch (clipboard can be blocked in non-secure or embedded contexts). Shows a check icon and "Copied" for 2 s, announces it with an `aria-live="polite"` text, touch target at least 36 px high, `type="button"`.
2. **Form submit with pending state.** The repo already has `components/loading/SubmitButton.tsx` (uses `useFormStatus`, shows `Spinner`). Reuse it for server-action forms; extend it so it accepts the existing blue pill classes without the shadcn `Button` overriding them. Add `useFormStatus`-based disabling so double submits are impossible.
3. **`lib/errors/friendly.ts`**: maps Postgres and RPC errors to plain messages (see 3.5); never show constraint names or raw SQL text to customers. If the SweetAlert spec's `friendlyError` already exists, extend that instead.
4. **`components/admin/ClickableStat.tsx`** or an `href` prop on `AdminStat` (see A3).
5. **`components/admin/DocumentViewer.tsx`** (client dialog, see A1).

## 3. Customer side

### C1 — Refresh after saving profile and documents
- **Finding (confirmed):** `saveProfile()` in `profile-editor.tsx` uploads the files to `/api/account/documents` and updates the profile, then only sets local state. The server component `app/account/profile/page.tsx` is never refreshed, so the verification chip (`verification` prop) and document flags stay stale. The database trigger `mark_customer_documents_pending` changes `verification` to `pending` on a new upload, but the screen keeps showing the old status. The selected-file inputs are also not cleared (state is reset but the `<input type="file">` is uncontrolled).
- **Fix:**
  1. After a successful save call `router.refresh()` (from `next/navigation`) and keep the busy state until the refresh finishes (use `useTransition`/`startTransition` around it).
  2. Make the verification chip, license present and ID present flags derive from props again after refresh (use a `key` on the editor built from `verification + hasLicense + hasId`, or sync state in an effect).
  3. Reset the file inputs with a form `ref.reset()` or a changing `key`.
  4. Show the success message after the refresh, and a clear line when the status becomes pending: *"Your documents were submitted for review."*
  5. Also refresh other customer views that depend on verification: the booking page `/cars/[id]` reads `verification` on the server per request, so no extra work is needed there; confirm that it is not served from a stale cache after `router.refresh()`.
- **Acceptance:** after saving, the page content updates without a manual reload; the verification chip shows *Pending*; file inputs are empty; no duplicate submit is possible while saving; works on mobile.

### B1 — Cancellation policy dialog on "Request self-drive" (and "Request with driver")
- **Current:** `app/cars/[id]/page.tsx` has two server-action forms (`book`) for self-drive and with-driver. The policy text only exists in `app/terms/page.tsx` ("Cancellations and refunds").
- **Behavior wanted:** clicking the request button opens a dialog with the cancellation policy and an **Accept** button. The booking is created only after Accept.
- **Build:**
  1. Single source of truth: `lib/policies/cancellation.ts` exporting `CANCELLATION_POLICY_VERSION` (for example `"2026-11-21"`) and the policy content (title, short bullet list, link to the full terms). Use it in the dialog **and** in `/terms` so they never drift apart.
  2. **Policy wording must come from Jabez.** Start from what `/terms` already says (deposit about 30% paid to the owner within 24 h; cancellation arranged through the platform; the owner returns a received deposit according to the cancellation terms agreed for that rental; owner cancellations get a full deposit refund; the owner records the refund). Do **not** invent refund percentages or time limits. If the wording changes, bump the version.
  3. `components/booking/BookingPolicyDialog.tsx` (client): wraps the submit button of each booking form. First click opens the dialog (`Dialog` from the repo's shadcn/base-ui components): title, short policy, link *Read full terms* (new tab), and two buttons: **Accept and request booking** and **Cancel**. Accept sets a hidden input `policy_accepted=1` and `policy_version`, then submits the form through `formRef.requestSubmit()` and shows the pending state (B2). Esc and Cancel close it without submitting; focus returns to the button.
  4. Server action `book`: reject a missing or outdated acceptance (`redirect(...&bookingError=policy)`) and add the message to the existing `bookingError` mapping (*"Please accept the cancellation policy to continue."*).
  5. **Record the acceptance** (proof for disputes): new columns `bookings.cancellation_policy_version text`, `bookings.cancellation_policy_accepted_at timestamptz`. The server action passes them in the insert; add both columns to the column-level `grant insert (...) on public.bookings` list (the effective grant is in `202611060003_payment_qr_module.sql`, around line 268; check the latest one when writing the migration). Show the accepted version and time in the admin booking details.
  6. Accessibility: `role="dialog"`, `aria-modal`, labelled title, focus trap, the Accept button is a real button (not a link), text readable at 390 px, content scrolls inside the dialog if long.
- **Acceptance:** no booking row is created until Accept; accepting creates the booking with version and time stored; Cancel and Esc do nothing; works for both modes; the dialog text matches `/terms`.

### B2 — Loading indicator on the request button
- **Finding (confirmed):** both `book` forms use a plain `<button>`; a server action takes a moment (checks, insert, redirect) and nothing shows progress or prevents a second click.
- **Fix:** use the pending-aware submit button (section 2) for **Request self-drive**, **Request with driver** and **Update dates** (B3). While pending: spinner, text *"Sending request…"*, disabled, `aria-busy`. Inside the policy dialog, the **Accept** button shows the same pending state, and the dialog cannot be dismissed during submission. Keep the existing disabled rules (`!rate || !start || !end || verification…`).
- **Acceptance:** one click creates one booking; a spinner is visible until the redirect to the pay page; the button cannot be clicked twice.

### B3 — "Update dates" must keep the user at Booking summary
- **Finding (confirmed):** "Update dates" is a plain `<form action="/cars/${id}">` (GET). The browser navigates to `/cars/{id}?from=…&to=…` and loads at the top of the page, so the customer lands on the hero again. The page is rendered inside `Suspense` after `await connection()`, so a `#fragment` alone is unreliable while content streams in.
- **Fix:**
  1. Add `id="booking-summary"` and `scroll-mt-24` to the Booking summary `<aside>`.
  2. Replace the plain form with a small client component `components/booking/DateUpdateForm.tsx`. It builds the URL (keep `mode` and `pickup`), calls `router.replace(url, { scroll: false })` inside `startTransition`, shows a pending state on the button (B2), and keeps the scroll position.
  3. When the page loads with `from` and `to` in the URL and the user came from an update (set a `sessionStorage` flag in the client component right before navigating, wrapped in try/catch), run `document.getElementById("booking-summary")?.scrollIntoView({ block: "start" })` once on mount. This also covers a hard reload.
  4. Make the rental-mode tabs (`Link` components for Self-drive and With driver) use `scroll={false}` so they behave the same way.
  5. Keep working without JavaScript: the form's `action` stays `/cars/${id}#booking-summary` as a fallback.
  6. Validation stays as today (min dates, return after pickup).
- **Acceptance:** on mobile and desktop, after "Update dates" the Booking summary (with the new price) stays in view; no jump to the hero; the browser Back button still works; the invalid-dates message appears next to the form.

### B4 — Copy button for the booking reference
- **Where:** customer booking card (`components/customer/booking-list.tsx`, the "Booking reference" block), the pay page (`app/account/bookings/[id]/pay/page.tsx`, the line "Booking {reference}" and the "add booking reference … to your transfer note" sentence), the booking-created confirmation if one exists, and as an easy extra the owner and admin booking lists.
- **Fix:** use `CopyButton` (section 2) next to the reference; on the pay page also add **Copy amount**. The reference text stays selectable.
- **Acceptance:** one tap copies the exact reference; "Copied" feedback appears and is announced; works on iOS Safari and Android Chrome; no layout break at 390 px.

### B5 — "To Pay" shows an error although the owner has the deposit and the booking is confirmed
**Search result.** I could not find a screen labeled "To Pay" in the Nov 18 snapshot. The customer side has the pay page (`/account/bookings/[id]/pay`, button **Pay deposit** / **View payment** in the booking list). The exact error text was not provided, so the cause below is derived from the code and **must be reproduced** before closing. The code shows these ways to see an error for a payment that actually went through:

1. **Double submit race (likely).** In `components/customer/payment-proof-form.tsx`, `submit()` inserts into `payments`, calls `router.refresh()` (not awaited) and then `setBusy(false)` in `finally`. For a moment the form is enabled again, with the same reference. A second click inserts again. The database then returns either a unique violation on `payments_reference_unique` (see 3 below) or the trigger error *"This booking is not accepting payment proofs."* (once the booking is no longer `awaiting_payment` or `payment_review`). The first submission has already succeeded, so the owner receives and confirms it while the customer is looking at a red error.
2. **Stale page after the owner confirms (likely).** The pay page is rendered on the server once and never updates. When the owner confirms (`confirm_booking_payment` sets the booking to `confirmed`), a customer still on that page sees the old "Submit transfer proof" form; pressing the button produces *"This booking is not accepting payment proofs."* If they reload, the page silently redirects to `/account/bookings` (`redirect` when status is not `awaiting_payment` or `payment_review`), with no "payment confirmed" message at all.
3. **Global reference uniqueness (confirmed in the migration).** `202611060003_payment_qr_module.sql` creates `payments_reference_unique` on `reference_no` for **all** payments, including rejected ones. A customer whose proof was rejected (for example an unclear screenshot) and who resubmits with the same transaction reference gets a raw unique-violation message. The same applies to any repeated submission. (Note: this corrects an earlier statement in `kuyog-bohol-qr-payment-hardening.md` that said no uniqueness exists.)
4. **Raw errors shown to the customer.** `payment-proof-form.tsx` shows `cause.message` as is, so database messages (constraint names, trigger text) reach the customer. Also, if the insert response is lost on a weak mobile connection, the code deletes the uploaded proof image (`storage.remove`) even though the row may already exist, leaving a payment without a picture.

**Diagnose first (before coding):**
- Reproduce on a test booking: submit proof, press the button twice quickly; open the pay page in two tabs, confirm as the owner in one, submit in the other.
- Collect the exact error text from the customer who saw it, the Vercel function logs and the Supabase Postgres logs around the confirmation time. Search for `payments_reference_unique`, `not accepting payment proofs`, `exact deposit amount`, `payment window has expired`.
- Check that no other component (for example a newer branch) renders a "To Pay" list.

**Fix:**
1. **No double submit and no flash of the form.** After a successful insert set a local `submitted` state and replace the form with the status card at once (*"Proof sent. The owner is checking your payment."*); keep the button disabled until the refreshed server state arrives (`startTransition(() => router.refresh())`).
2. **Idempotency in the database** (migration `202611210002_testing_fixes.sql`):
   - Replace the global index: `drop index public.payments_reference_unique; create unique index payments_reference_active_unique on public.payments (reference_no) where status in ('pending','verified') and reference_no is not null;` so a rejected reference can be reused. (The QR hardening spec later narrows this per owner; keep them consistent, one index only.)
   - Add `create unique index payments_one_pending_per_booking on public.payments (booking_id) where status = 'pending';` so a duplicate click cannot create a second pending proof.
3. **Treat "already submitted" as success.** In the client, if the insert fails with Postgres code `23505` for either index, or the trigger text *not accepting payment proofs* and the booking now has a pending or verified payment, do not show an error; refresh and show the current status. Do not delete the uploaded proof in that case; delete it only when the insert failed and no payment row exists for that path.
4. **Show the real state.** On the pay page: if the booking is `confirmed`, render a **Payment confirmed** card (amount paid, balance at pickup, booking reference with Copy, link to My bookings) instead of redirecting silently; `payment_review` shows the waiting card with the review deadline. Keep the redirect only for statuses where paying makes no sense (`cancelled`, `expired`, `completed`), with a short notice.
5. **Keep the page fresh.** While the booking is `payment_review`, poll with `router.refresh()` every 15 s only when the tab is visible (`document.visibilityState`), and stop when the status changes. (A Supabase Realtime subscription on the customer's own booking row is acceptable instead.) Show a small toast when it becomes confirmed.
6. **Friendly errors.** Map `23505`, *not accepting payment proofs*, *exact deposit amount*, *payment window has expired*, network failures and storage errors to plain messages (section 2). The raw message goes to `console.error` only.
7. **Tests:** double click, two tabs, rejected proof resubmitted with the same reference, slow network (throttle) and offline mid-submit, owner confirms while the form is open.
- **Acceptance:** a customer never sees an error for a payment that was recorded; the pay page shows *Payment confirmed* when the owner confirms; a rejected proof can be resubmitted with the same reference; no second pending proof can exist for one booking; the uploaded image is never deleted when a payment row exists.

## 4. Admin side

### A1 — Customer documents must open for viewing, not download
- **Finding (likely):** `viewDocument()` in `components/admin/customer-manager.tsx` calls `createSignedUrl(path, 60)` and then `window.open(url, "_blank")`. Whether the browser displays or downloads depends on the response headers for that object; files uploaded with an unknown content type, and some PDF cases and popup-blocked tabs (the `window.open` runs after an `await`, which Safari and some Android browsers block) end up downloading or doing nothing.
- **Fix (recommended):** an in-app viewer.
  1. New route `GET /api/admin/customer-documents/[customerId]/[kind]` (`kind` = `license` or `id`): checks the caller is an admin (`getAdminContext`/`is_admin`), reads the path from `profiles`, downloads the object with the service role, and streams it with `Content-Type` taken from the file extension (`webp`, `png`, `jpeg`, `pdf`), `Content-Disposition: inline`, `Cache-Control: no-store, private`, `X-Content-Type-Options: nosniff`. No signed URL is exposed to the browser. Add an audit entry `document.viewed` (audit log spec) with customer id and kind.
  2. `DocumentViewer` dialog: images shown in an `<img>` with zoom (fit and 100%) and rotate; PDFs in an `<iframe>` (or `<object>`) with a fallback link *Open in new tab* (same inline route). Include a **Download** button as a separate, explicit action (the route supports `?download=1` which sets `attachment`).
  3. The **License** and **ID** buttons open this dialog directly (no `window.open`); show a spinner while loading and a clear error if the file is missing.
- **Acceptance:** clicking License or ID shows the document inside the app on desktop, iPhone and Android; PDFs and images both display; download only happens when the admin presses Download; only admins can call the route; each view is audit logged.

### A2 — Review button "not clickable"
- **Finding (likely):** the Review column has two tiny buttons (**Approve**, **Reject**, about 10 px text). **Approve** is disabled when the customer is already approved or when the license or ID is missing; **Reject** is disabled when already rejected. Disabled styling is only `opacity-40`, no reason is shown, and rows whose customer has not uploaded both documents look "dead". Errors are shown only once at the top of the table.
- **Fix:**
  1. Replace the two buttons with a visible **Review** button (min height 36 px) on every row; it is enabled for any customer with at least one document or a `pending` status. If no documents exist, show *"No documents"* text instead of a dead button.
  2. **Review** opens a drawer or dialog with: customer name, phone and joined date, both documents (reusing `DocumentViewer`), a short checklist (name matches ID, license not expired, photo is clear), and the decision buttons **Approve** and **Reject**.
  3. **Approve** requires both documents; if one is missing, show the reason in plain text next to the disabled button (*"License not uploaded"*).
  4. **Reject** asks for a reason (min 5 characters) and stores it so the customer can see why: add `profiles.verification_note text` (admin-written only; extend `admin_set_customer_verification` with an optional `p_note`, keep the old signature working, `security definer`, `set search_path = ''`, `revoke ... from anon`). Show the note in the customer's profile page next to the *Rejected* chip. (Optional, small: notify the customer with `notify()` on approve or reject if not already done.)
  5. Errors appear inside the drawer, success shows a toast, the row updates through `router.refresh()`.
  6. The admin dashboard shortcut *Review customer verification* and the customers card (A3) link to `/admin/customers?verification=pending`; `app/admin/customers/page.tsx` reads that parameter and passes `initialFilter` to `CustomerManager`.
- **Acceptance:** every row with documents has an obviously clickable **Review** button; the drawer shows both documents; approve and reject work and update the row; reject needs a reason; disabled states always show why; keyboard and screen reader work.

### A3 — Dashboard cards must be clickable
- **Finding (confirmed):** `AdminStat` in `components/admin/ui.tsx` renders an `<article>` with no link, and `app/admin/page.tsx` passes no destination.
- **Fix:** add `href?: string` (and an optional second link for the note) to `AdminStat`; when `href` is set, wrap the card in a Next `Link` (whole card clickable) with `hover:border-…` and `hover:shadow`, a `focus-visible` ring, a small arrow icon, and an `aria-label` such as *"Rental owners: 4. Open owners"*. Do not nest links: the "N awaiting verification" note on the Customers card becomes a separate link only if the whole card is not a link; otherwise the card goes to `/admin/customers` and the shortcut list on the right handles *pending*.
- **Destinations:**
  | Card | Link |
  |---|---|
  | Rental owners | `/admin/owners` |
  | Fleet vehicles | `/admin/cars` |
  | Customers | `/admin/customers` (the pending count in the note goes to `/admin/customers?verification=pending`, implemented as a separate link on the note and the card link on the title area, or only the card if nesting is a problem) |
  | Monthly commission | `/admin/commissions` |
- Also make each row in **Recent bookings** link to the booking in `/admin/bookings` (filter by reference), and give the **View all** link the same hover style. Optional: apply the same `href` support to the owner dashboard cards in `app/owner/page.tsx`.
- **Acceptance:** every card is a real link (keyboard focusable, Enter works, visible focus ring); correct destinations; mobile tap area is the whole card; no nested-anchor warnings in the console.

## 5. Build order (one commit per item)

1. **Shared pieces** (section 2): `CopyButton`, pending submit button, `friendlyError`.
2. **B5 database + client fix** (highest impact): migration `202611210002_testing_fixes.sql` (index replacement, one pending proof per booking), form changes, pay page states and polling.
3. **B2 + B3**: pending buttons and the date-update component with scroll handling.
4. **B4**: copy buttons on the booking card, pay page, and (extra) owner and admin lists.
5. **B1**: policy module, dialog, server-action check, acceptance columns (same migration file or a second one), `/terms` using the shared policy.
6. **C1**: profile refresh.
7. **A3**: clickable dashboard cards, `initialFilter` support on customers.
8. **A1 + A2**: document route and viewer, Review drawer, `verification_note`.
9. Final pass: accessibility (focus, aria-live), mobile at 390 px, loading and error states, lint, typecheck, build.

## 6. Test plan

- **Customer:** save profile with new documents and watch the status chip change without reload; request a booking and check that nothing is created before Accept; Cancel and Esc close the dialog; the request button shows a spinner and cannot be double-clicked; update dates on mobile and desktop and confirm the page stays at the summary; copy the booking reference on iOS and Android; the full payment scenarios listed in B5.
- **Admin:** click License and ID (image and PDF, desktop and phone) and confirm in-app viewing; approve and reject through the Review drawer; open each dashboard card and the pending shortcut; keyboard-only run through the customers table.
- **Database:** insert two pending proofs for one booking (second fails with `23505`); a rejected reference can be reused; a pending or verified reference cannot be reused; the new booking columns are writable only through the server action path; `admin_set_customer_verification` still works with the old signature and with a note.
- **Regression:** booking creation for with-driver, owner payment confirmation, expiry cron, notifications, admin pages. `npm run lint`, `npx tsc --noEmit`, `npm run build`.

## 7. Acceptance checklist

- [ ] Profile and documents screen updates right after saving (status, flags, empty inputs).
- [ ] Cancellation policy dialog appears before any booking is created; Accept creates it and stores version and time.
- [ ] Request buttons show a loading state and cannot be double-submitted.
- [ ] Update dates keeps the customer at Booking summary.
- [ ] Booking reference has a working Copy button (booking card and pay page at least).
- [ ] A customer never sees an error for a payment that was recorded; pay page shows *Payment confirmed*; rejected references can be reused.
- [ ] Admin documents open in an in-app viewer; download is explicit; views are audit logged.
- [ ] Admin Review button is obvious and works; reject needs a reason; disabled states explain themselves.
- [ ] All admin dashboard cards are keyboard-accessible links with correct destinations.
- [ ] No regressions; lint, typecheck and build pass; layout is clean at 390 px.

## 8. Open questions for Jabez (answer before or during the work)

1. **Cancellation policy wording:** what exactly should it say (refund rules before pickup, owner cancellations, no-shows, deposit)? The dialog will use the current `/terms` wording until you decide.
2. **B5:** what exact message did the customer see, and was it right after submitting proof, or later when opening the booking? Please send a screenshot or the text if you can.
3. Should rejected customers see the admin's rejection reason? (Recommended yes.)

## 9. Codex prompt

*"Implement the fixes in `kuyog-bohol-testing-fixes-plan.md`. First read the files named in each item (and read the Next.js 16 docs in `node_modules/next/dist/docs/`), confirm each finding in the current code, then follow the build order in section 5, one commit per item. Start with the shared pieces and the B5 payment fix (migration `202611210002_testing_fixes.sql`, idempotent proof submission, pay page states, friendly errors). Do not show raw database errors to users, never delete an uploaded proof when a payment row exists, and keep admin document access admin-only and audit logged. Use the existing `SubmitButton`, `Spinner` and shadcn dialog components. Run lint, typecheck and build, and list anything you could not verify, including the exact error you reproduced for B5."*
