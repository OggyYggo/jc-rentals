# Kuyog Bohol — Customer Payment Refinement + Back Button and Pull-to-Refresh on Mobile (Instructions for Codex)

Designs are on the design canvas, row "Customer payment refinement, plus back button and pull to refresh on mobile": **Customer payment: pay step**, **send proof**, **fixing problems**, **proof sent**, **Navigation: pull to refresh**, **back and refresh header rules** (mobile), and **Customer payment: two columns** (desktop).

> Next.js 16 here has breaking changes. Read the relevant guide in `node_modules/next/dist/docs/` before changing layouts, routes or data fetching.

There are three problems to fix. Problem 1 is a bug that blocks payments, so do it first.

## Rules
- **No change to payment, booking, QR, credit or receipt logic.** Same RPC (`submit_booking_payment`), same storage bucket and path rules, same statuses, same polling, same audit and disputes. This is a UI refinement plus a bug fix in the browser-side image handling.
- Keep the existing connection-state, onboarding tip and alert work (`showConnectionDialog`, `UploadPaused`, `CustomerQrTip`, `runWithAlerts`).
- Brand tokens: primary `#0A47B1`, dark `#0A3D91`, light `#EAF4FF` / `#F3F9FF`, text `#0F2342`, muted `#5B6F89`, borders `#E3EEF9` / `#D6E6F7`, success `#12703A` on `#E3F7EA`, warning `#8A5A00` on `#FFF2D6`, danger `#A12A2A` on `#FDE8E8`. Inter headings, Work Sans body.
- Accessibility: 44px touch targets, visible focus rings, `aria-label` on icon-only buttons, errors are `role="alert"` and tied to their field with `aria-describedby` and `aria-invalid`, text 13px or larger, input text 16px or larger (prevents iOS zoom), `prefers-reduced-motion` respected. Never truncate amounts or references. Times in Asia/Manila.

## 0. Look at the code first and report
Open `app/account/bookings/[id]/pay/page.tsx`, `components/customer/booking-payment-options.tsx`, `payment-proof-form.tsx`, `booking-payment-controls.tsx`, `payment-status-refresh.tsx`, `lib/payment-image.ts`, `lib/payment-format.ts`, `lib/alerts/errors.ts` (`friendlyPaymentError`), `components/customer/account-shell.tsx`, the customer and public headers, `app/manifest.ts`, `app/layout.tsx`, `public/sw.js`, and the storage bucket and `submit_booking_payment` definitions. Report differences from this file.

## 1. Bug: "all fields filled but can't continue" (fix first)
**Probable causes found in the code (confirm each by testing on a real iPhone and Android phone):**
1. **`lib/payment-image.ts` fails on Safari and every iPhone.** It encodes with `canvas.toBlob(..., "image/webp")` and then throws "Could not convert this image to WebP." if the result is not WebP. Safari cannot encode WebP from a canvas and returns PNG, so **every iPhone upload fails** at this check.
2. **The 5 MB limit is applied to the original file before compressing.** Phone screenshots are often 3 to 10 MB PNG files that would shrink well below 1 MB after resizing, but are rejected up front.
3. **Android pickers can return an empty or unusual `file.type`** (for example from Files or Google Photos), which fails the `["image/jpeg","image/png","image/webp"].includes(file.type)` check even for a valid image. HEIC and HEIF photos on some devices also fail.
4. **The error message is hidden by a generic one.** `friendlyPaymentError` maps `"Choose a JPEG, PNG or WebP image up to 5 MB."` and `"Could not convert this image to WebP."` to "We couldn't submit your proof. Check your booking before trying again.", so the customer cannot tell what to fix.
5. **The reference rule** (`^[A-Z0-9]{6,40}$` after removing spaces and punctuation) shows its message only after submit. A customer who typed a short or unusual reference sees a vague error.
6. The submit button can also stay disabled (`uncertain`, `paused`) with no visible reason.

**Fixes:**
1. Rewrite `paymentImage`:
   - Accept any image the browser can decode: do not rely on `file.type`; also check the extension, and try `createImageBitmap`; accept HEIC/HEIF only if the browser can decode it, otherwise show the friendly message in item 4.
   - Raise the **input** limit (for example 25 MB), resize to 2000 px on the longest side, then **encode**: try WebP; if the returned blob type is not `image/webp`, **fall back to JPEG at quality 0.85**. Enforce the 5 MB limit on the **output**. If still too large, retry at lower quality (0.7, then 0.6), then a smaller size.
   - Use the correct file extension in the storage path (`.webp` or `.jpg`) and the matching `contentType`. The bucket already allows `image/jpeg`, `image/png` and `image/webp` and the path rules only check the folder prefix, so **no migration is needed**. Verify this in the bucket and the RPC and report it.
   - Fall back to an `<img>` plus canvas when `createImageBitmap` is missing, and release object URLs and bitmaps.
   - Throw typed errors: `IMAGE_UNREADABLE`, `IMAGE_TOO_LARGE`, `IMAGE_TYPE`.
2. Map those errors in `friendlyPaymentError`, and the reference error, to specific messages (section 3). Never fall through to the generic message for a known cause.
3. Validate on the fields themselves with inline messages (section 3), not only at submit.
4. The submit button is disabled **only** with a visible reason under it ("Fix the reference to continue"). If a transient state (`uncertain`, `paused`) disables it, show why.
5. Log (server-side friendly log, no personal data) the error type, `file.type`, `file.size`, and `userAgent` family when image processing fails, through the existing logging path, so future failures can be diagnosed.

## 2. Payment screen: simpler and shorter (mobile first, desktop refined)
Boards: *pay step*, *send proof*, *fixing problems*, *proof sent*, *two columns (desktop)*.

The page today shows amount, a long "How to pay" list, a reference block, a policy block, safety deposit text and the form all at once, in long sentences. The new flow has **two steps with a stepper: 1 Pay, 2 Send proof**.

**Step 1: Pay** (`/account/bookings/[id]/pay`)
- Header (see section 4): back, title "Pay deposit", refresh.
- Stepper: **1 Pay**, **2 Send proof**.
- **Amount card** (blue): label "Amount to pay now", the amount (36px), a **Copy** button, a time-left chip ("23h 41m left", amber under 1 hour red) and "Pay by Nov 29, 9:00 AM".
- **Payment option card:** provider tile, "{label} · {account name}", masked account hint, QR (tap to enlarge, as today), buttons **Open {GCash/Maya} app** and **Save QR** (existing handlers and fallback message). If there is more than one option, keep the existing option chips above the card; the existing "Pay with" picker stays but with shorter text.
- **Collapsed accordions** (closed by default): **How to pay** (3 short steps: open your wallet or bank app and tap Pay QR; scan and pay exactly the amount; take a screenshot of the receipt) and **Booking details** (balance at pickup, safety deposit with the existing `safetyDepositCopy` inside, and the existing cancellation policy component). The long text moves inside these.
- **Sticky bottom bar** (safe-area aware): primary **I paid, send proof**, and the small line "Reference {KB-…}" with a copy action. Tapping the primary button goes to step 2 (same as the current `showProof`).
- Remove duplicates: the booking reference appears once (sticky bar), the status chip stays only when it adds information.
- The existing tip (`CustomerQrTip`) stays but never covers the QR or the primary button.

**Step 2: Send proof** (same route, step state; keep it in the URL as `?step=proof` so refresh and Back keep the place)
- Header title "Send proof", back goes to step 1.
- Title "Send your proof", one line "Two things so the owner can confirm.", a small summary row "You are sending proof for ₱1,500".
- Field 1: **Transaction reference** (16px, `autocomplete="off"`, `autocapitalize="characters"`, `inputmode="text"`), with a live check: green tick and "Looks good. Spaces are ignored." when valid; red with "Too short. Use 6 to 40 letters or digits from your receipt." when not. Keep the current example figure behind a small "Where do I find it?" link instead of a permanent block.
- Field 2: **Screenshot of your payment** as a picker card ("Choose screenshot", "From your gallery or files"). After choosing: thumbnail, file name, size and **Change**; show "ready" in green once processing succeeds. Processing happens right after the choice (with a small spinner), not only at submit, so errors show immediately.
- A two-item ready row: ✓ Reference ✓ Screenshot.
- Sticky **Send proof** button; disabled until both are valid with the visible reason line below it.
- On send, keep the existing submit, connection-lost, "We couldn't confirm this" and upload-paused behavior unchanged.

**Fixing problems** (board *fixing problems*)
- Reference error under the field (red border, warning icon, message).
- Image problem box (red tint, `role="alert"`): "We couldn't use this screenshot. It may be too large or in a format we can't read. Try again, or take a new screenshot." with **Choose another** and **Try again**. Specific titles: "This file isn't an image", "This image is too large even after shrinking", "We couldn't read this image".
- Server rejections keep their existing wording, shortened: reference already used, deposit amount changed, payment window passed, proof limit reached.

**Proof sent** (board *proof sent*): green tick, "Proof sent", "The owner is checking your payment. We'll email you and send a notification.", a small summary (amount, reference, owner replies by), the line "This page updates by itself. Pull down to refresh.", primary **View my booking**. Other statuses (confirmed, in review, expired, rejected, refund) keep today's content and logic; only restyle them with the same header, cards and spacing.

**Desktop** (board *two columns*): left column = amount card and QR card; right column = "Send your proof" card with the two fields and **Send proof**, then the two accordions. Same behavior, no stepper gating on desktop (both columns visible; the stepper shows Pay as current until a proof is chosen). The single-column mobile layout stays `md:hidden`/`hidden md:grid` as the current page does.

## 3. Copy rules
Short sentences, one idea each, no paragraph above 2 lines on mobile. Replace: "Wallet or bank transaction reference" with "Transaction reference"; "Transfer screenshot (up to 5 MB)" with "Screenshot of your payment"; "Submit transfer proof" with "Send your proof". Move any policy text into the accordion. Keep exact wording from the cancellation policy component and `safetyDepositCopy`.

## 4. Back button and refresh in the installed app (problem 2)
**Cause:** `app/manifest.ts` sets `display: "standalone"`, so when the app is installed to the Home Screen (iOS and Android) the browser's back and reload controls are gone, and many pages have no in-app back control. Pull-to-refresh also does not exist in installed iOS apps. (No `overscroll-behavior: none` was found in the code; keep it that way.)

Boards: *back and refresh header rules*, *pull to refresh*.
1. **Page header component** `components/layout/PageHeader.tsx` used by every page that is not a tab root: a 56px sticky bar with **Back** (chevron + parent label, 44px target, `aria-label="Back"`), centered title, and a **Refresh** icon button on the right. Safe-area padding at the top (`env(safe-area-inset-top)`).
2. **Rules:** tab root pages (Home, Bookings, Payments, Owners and the admin and owner tab roots) have **no back button**. Every other page has one. Back uses `router.back()` when the previous page is inside the app (`history.length > 1` and same-origin referrer); otherwise it navigates to a defined **parent route** (for example `/account/bookings/[id]/pay` to `/account/bookings`), so it never exits the app or does nothing. Define the parent map in one file.
3. **Refresh button:** calls `router.refresh()` inside a transition and, where a page uses client data, its refetch; shows a spinner and then "Updated 10:42 AM" for 3 seconds, and an error toast on failure (use the connection helpers). Disable while offline with the offline banner already present.
4. **Pull-to-refresh** component `components/layout/PullToRefresh.tsx`: wraps page content on mobile only, active when the page is at scroll top and the display mode is standalone (`matchMedia('(display-mode: standalone)')` or `navigator.standalone`) — in a normal browser tab the native gesture keeps working. Three states: "Pull to refresh", "Release to refresh", "Refreshing…". Threshold about 72 px, resistance, cancel on horizontal swipe, ignore when a dialog or sheet is open or the touch starts inside a horizontally scrollable area or a map. Triggers the same refresh as the button. Respect `prefers-reduced-motion` (no rotation animation, text only).
5. Do **not** set `overscroll-behavior: none` on `html` or `body`. Keep `overscroll-contain` on sheets and scrollable panels as they are.
6. Apply the header to: customer account pages, booking pages (including pay, pickup pass, receipt), owner sub-pages (vehicle edit, credits sub-pages, deposit review, staff, agreement), admin sub-pages (settings sections, top-ups detail, owner detail), and public pages in the installed app (vehicle details, booking request). Report any page that already has its own back link and reuse it instead of duplicating.
7. Optional, report before doing: consider `display: "standalone"` with `display_override: ["standalone", "minimal-ui"]`. Do not switch the manifest to `browser` without asking.

## 5. Loading, empty and error states
Pay and proof pages keep their `loading.tsx` skeletons and add skeletons that match the new cards. Image processing shows a small spinner on the picker. If refresh fails, show the existing connection toast and keep the current content.

## 6. Tests
1. **iPhone (Safari and the installed app):** choose a 6 MB PNG screenshot and a normal photo; both process and upload; the stored file is JPEG or WebP; the proof appears for the owner. Repeat on Android Chrome with a screenshot, a camera photo and a file picked from Google Photos and from Files.
2. A very large image is shrunk below 5 MB; a PDF or text file shows "This file isn't an image"; a corrupt image shows "We couldn't read this image"; none of them show the old generic message.
3. Reference: 5 characters shows the short error live; `GC 7K2M 9P4Q 1`, a 13-digit GCash reference and a 12-character Maya reference are accepted; a duplicate shows the existing "already used" message.
4. The Send proof button is disabled only with a visible reason; with both fields valid it is enabled and submits once (double-tap safe).
5. Existing flows still work: payment already confirmed, proof rejected then resubmit, window passed, upload paused offline, "We couldn't confirm this" dialog, receipts, disputes, refunds, cancel booking.
6. Step state: browser Back and the header Back move between step 2 and step 1; refresh keeps the step; the stepper reflects the step.
7. Installed app on iOS and Android: every non-tab page shows Back; Back never leaves the app; refresh button works; pull-to-refresh works at the top of a page and does not fight scrolling, carousels, maps or sheets; in a normal browser tab the native pull-to-refresh is unchanged.
8. 360px: no horizontal scroll, sticky bar never hides content (scroll to the end), text 13px or larger, inputs 16px or larger (no iOS zoom on focus); pinch zoom still works.
9. Keyboard and screen reader: errors announced, fields labeled, accordions expandable by keyboard, header buttons reachable, focus returns after dialogs.
10. `npm run lint`, `npx tsc --noEmit`, `npm run build`; add unit tests for `paymentImage` fallbacks (WebP unsupported, large input, empty `file.type`) and for the parent-route map.

## Out of scope
Changing payment logic, QR generation, owner-side deposit review, receipts, disputes, refunds, the booking request form, native app packaging, offline payments.

## Codex prompt
*"Read `kuyog-bohol-payment-refresh-back.md`. First report how the customer pay page, the proof form, `lib/payment-image.ts`, the headers, the manifest and the service worker work today, and confirm or correct the probable causes of the proof-upload failure on iPhone and Android. Then implement: the image processing fix with JPEG fallback and specific error messages; the simplified two-step payment screens for mobile and the two-column desktop layout with accordions, sticky bar and live field validation; and the shared page header with a back button and refresh button, the parent-route map, and pull-to-refresh for installed apps. Add no payment, RPC, storage-policy or business-logic changes. Run lint, typecheck and build, add the unit tests, run the tests in section 6 on real devices where possible, and list anything you could not verify."*
