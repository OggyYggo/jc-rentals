# Kuyog Bohol — Poor Connection, Timeout and Offline States, Mobile + Desktop (Instructions for Codex)

Designs are on the design canvas, row "Poor connection and timeout states": **Connection: offline banner (mobile)**, **slow and back online toasts (mobile)**, **timed out, safe to retry (mobile sheet)**, **not sure it went through (mobile sheet)**, **page load failed and upload paused (mobile)**, and below them **Connection: offline banner and toasts (desktop)** and **timeout dialogs (desktop)**.

> Next.js 16 here has breaking changes. Read the relevant guide in `node_modules/next/dist/docs/` before changing layouts, routes or data fetching.

## Rules
- **UI and client-side behavior only.** No database, RLS, RPC, webhook or business-logic changes. Server actions, payment logic and audit logging stay exactly as they are.
- Reuse the existing alert system: `lib/alerts/run.ts` (`runWithAlerts`), `lib/alerts/toast.ts`, `lib/alerts/errors.ts` (`friendlyError`), `components/loading/ErrorState`, `app/error.tsx`, `app/global-error.tsx`. Extend them; do not add a second toast or dialog library.
- Brand tokens: primary `#0A47B1`, dark `#0A3D91`, light `#EAF4FF` / `#F3F9FF`, text `#0F2342`, muted `#5B6F89`, borders `#E3EEF9` / `#D6E6F7`, success `#12703A` on `#E3F7EA`, warning `#8A5A00` on `#FFF2D6`, danger `#A12A2A` on `#FDE8E8`. Inter headings, Work Sans body.
- Plain, calm wording. Never blame the user, never show raw errors, status codes or stack traces. Body text 13px or larger.
- **Never risk a double charge or double booking.** When the outcome of a request is unknown, do not offer a blind retry (see section 5).
- Accessibility: 44px touch targets, visible focus rings, `aria-live` regions, `prefers-reduced-motion` respected, dialogs trap focus and close on `Esc` (except the unknown-outcome dialog's Close, which still works).
- Times in Asia/Manila.

## 0. Look at the code first and report
Open `lib/alerts/*`, `components/loading/*`, `app/error.tsx`, `app/global-error.tsx`, `public/sw.js`, `components/owner/online-topup.tsx`, `lib/payments/quickpay.ts`, the booking flow and the proof upload components. Report: how `runWithAlerts` handles network errors today, whether any `online/offline` listener already exists, whether fetches use timeouts or `AbortController`, which requests already send an `Idempotency-Key`, and what `sw.js` caches. Report differences from this file before coding.

## 1. Connection status (global)
Create `lib/connection/` with:
- `useConnectionStatus()` hook returning `"online" | "offline" | "slow"`. Sources: `navigator.onLine` plus `online`/`offline` events, and `navigator.connection` (`effectiveType` `2g`/`slow-2g` or `downlink` under 0.4) where supported. Treat missing APIs as online. SSR-safe (initial `"online"`).
- `<ConnectionProvider>` mounted once in the root layout, exposing the status through context.
- A `fetchWithTimeout(input, init, { timeoutMs })` helper using `AbortController`. Defaults: 15 s for reads, 30 s for writes and uploads, 45 s for payment creation. Throws a typed `ConnectionError` with `kind: "offline" | "timeout" | "network"`.

## 2. Offline banner (mobile and desktop)
Boards: *offline banner (mobile)* and *offline banner and toasts (desktop)*.
- Persistent, non-dismissible banner under the top bar while status is `offline`: icon, **"You're offline"**, line **"Check your Wi-Fi or mobile data. We'll reconnect automatically."** `role="status"`, `aria-live="polite"`, amber warning tokens.
- Mobile: sits below the top bar, above content, not hidden behind the bottom bar. Desktop: full-width strip under the header.
- While offline, primary buttons that need the network are disabled and read **"Needs internet to continue"** (mobile board). Forms keep what the user typed.
- Browsing already-loaded pages still works.

## 3. Toasts
Boards: *slow and back online toasts (mobile)* and *offline banner and toasts (desktop)*.
Extend `lib/alerts/toast.ts` with two variants using the existing placement (top on mobile, top-end on desktop):
1. **Slow connection** (status `slow`, or any request still pending after 8 s): "Slow connection. This may take a bit longer." with an inline **Retry** action only when a retryable request is pending. Auto-dismiss after 6 s, show at most once per 60 s.
2. **Back online**: success tone, "You're back online." 3.2 s, shown only after an offline banner was visible. The banner disappears at the same time.
- Pending actions show the spinner button state with its label changed (for example **"Opening payment…"**), not a toast.
- `role="status"` for both; the Retry button is keyboard reachable.

## 4. Timeout dialog, safe to retry
Boards: *timed out, safe to retry (mobile sheet)* and *timeout dialogs (desktop)*, first dialog.
- Use when a **read or idempotent** request fails with `ConnectionError` kind `timeout` or `network`.
- Mobile: bottom sheet. Desktop: centered dialog, 440px wide.
- Content: icon tile, title **"This is taking too long"**, body **"Your connection seems slow. Nothing was changed. You can try again."**, primary **Try again**, secondary **Close**.
- **Try again** re-runs the same action once with the same inputs; if it fails again, keep the dialog and show "Still not working. Check your connection and try again."
- Replaces the generic error dialog in `runWithAlerts` for these error kinds.

## 5. Not sure it went through (payments, bookings, uploads that create records)
Boards: *not sure it went through (mobile sheet)* and *timeout dialogs (desktop)*, second dialog.
- Use when a **write** (create checkout, submit booking, confirm payment, submit top-up) times out or loses connection **after the request was sent**.
- Title **"We couldn't confirm this"**, body **"We're not sure your request went through. Please check before trying again so you aren't charged twice."**
- Show a reference block: reference, amount and local time (Asia/Manila) of the attempt, for example `Reference KB-7Q4M2 · ₱1,500 · 2:14 PM`. Never truncate amounts or references.
- Primary **Check status**: calls the existing status endpoint for that reference (booking, top-up or checkout). Results: found and paid/created → close and show the normal success state; not found → enable retry; still unknown → keep dialog, "Still checking. Try again in a moment."
- Secondary **Try again (after checking)** is **disabled until Check status returns "not found"**. **Close** is always available.
- Generate the `Idempotency-Key` once per user action (before the first attempt) and **reuse it on every retry**, so a retry can never create a second charge or booking. Payment creation already supports `Idempotency-Key`; send the same header from booking and top-up submissions where the server accepts it, and report any endpoint that does not.
- Credits and bookings are only ever updated from verified server state, never from the client retry result alone.

## 6. Page load failed and upload paused
Board: *page load failed and upload paused (mobile)*.
- **Load failed** card: reuse `ErrorState` with a connection variant, title **"Couldn't load bookings"** (title per page), body "Check your connection and try again.", **Try again** calling the page's refetch / `router.refresh()`. Keep previously loaded data visible above or below when it exists.
- **Upload paused** card (proof of payment, vehicle photos, documents): shows file name, a paused progress bar, **Retry upload** and **Cancel**. Line: **"Your reference and amount are kept while you retry."** Keep the selected file and form values in state; do not clear the form on failure. Retry resumes with the same file.
- Failed uploads never create a record without the file attached; follow the existing upload logic.

## 7. Integration points
1. `lib/alerts/run.ts`: wrap the action with `fetchWithTimeout`-style handling; map `ConnectionError` to section 4 (safe) or section 5 (unknown outcome) based on an option `runWithAlerts(fn, { idempotent: boolean, reference?, amount?, checkStatus? })`. Keep the `actionInProgress` guard and the 600 ms loading dialog; close the loading dialog before showing a connection dialog.
2. `lib/alerts/errors.ts`: add friendly messages for offline, timeout and network; never show raw `TypeError: Failed to fetch`.
3. `lib/alerts/toast.ts`: add `slowConnectionToast` and `backOnlineToast`.
4. `components/loading/ErrorState`: add a `variant="connection"`.
5. `app/layout.tsx`: mount `ConnectionProvider` and the offline banner.
6. Apply first to: owner online top-up (`components/owner/online-topup.tsx`), booking submit and payment proof upload, owner credits activity, bookings lists. Then the rest of the app through `runWithAlerts`.
7. `public/sw.js`: do not cache API or payment responses. Optional: a minimal offline fallback page that shows the same "You're offline" message.

## 8. Tests
1. DevTools "Offline": banner appears within 1 s, buttons that need the network are disabled, typed form data stays. Going back online shows the "Back online" toast and removes the banner.
2. DevTools "Slow 3G" / throttled: slow toast appears once per minute at most; Retry only appears when a retryable request is pending.
3. Block a read request: "This is taking too long" shows; Try again works; a second failure keeps the dialog.
4. QuickPay top-up: drop the connection right after clicking **Continue to Payment**. The "We couldn't confirm this" dialog appears; **Check status** reflects the real state; **Try again** stays disabled until "not found"; the retry reuses the same `Idempotency-Key` and never creates two checkouts.
5. Upload a proof file while offline: upload paused card keeps file and form; Retry upload succeeds after reconnecting.
6. No raw error text, status codes or stack traces appear anywhere.
7. Mobile 360px and desktop 1280px: sheet and dialog fit, nothing hidden behind the bottom bar, no horizontal scroll.
8. Keyboard and screen reader: banner and toasts are announced politely; dialogs trap focus and close on `Esc`; Check status receives focus first in the unknown-outcome dialog.
9. `prefers-reduced-motion`: no spinner or slide animation beyond a static indicator.
10. `npm run lint`, `npx tsc --noEmit`, `npm run build`.

## Out of scope
Offline-first data sync, background sync queues, push notifications, changes to payment, webhook or credit logic, new database tables.

## Codex prompt
*"Read `kuyog-bohol-connection-states.md`. First report how `lib/alerts`, `ErrorState`, the service worker and the payment/booking/upload requests handle network failures today, and which requests already use idempotency keys. Then implement the connection status provider, the offline banner, the slow and back-online toasts, the safe-retry timeout dialog, the unknown-outcome dialog with Check status, and the load-failed and upload-paused states for mobile and desktop as described, reusing the existing alert system. Add no database or business-logic changes and never allow a retry that could double-charge. Run lint, typecheck and build, run the tests in section 8, and list anything you could not verify."*
