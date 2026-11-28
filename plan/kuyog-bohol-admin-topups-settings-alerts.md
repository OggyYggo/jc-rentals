# Kuyog Bohol — Admin Mobile Refinement (Top-ups, Settings) + Phone Alerts on Multiple Devices (Instructions for Codex)

Designs are on the design canvas, row "Admin mobile refinement: top-ups and settings, plus phone alerts on multiple devices":
- **Admin top-ups:** to verify, online, confirm before adding (mobile)
- **Admin settings:** home, payment timing, confirm changes, pause bookings (mobile)
- **Alerts:** devices list, device linked to another account, blocked and iPhone help, sign-out choice (mobile), and devices list + switch-account dialog (desktop)

> Next.js 16 here has breaking changes. Read the relevant guide in `node_modules/next/dist/docs/` before changing layouts, routes or data fetching.

## Rules
- **Admin top-ups and settings: mobile only (below `lg`).** The desktop pages and the desktop sidebar must look and behave exactly as today. Use `lg:hidden` / `hidden lg:block`, and compare 1280px screenshots before and after.
- **No business-logic, RLS or RPC changes for top-ups and settings.** Same data, same server actions, same validation, same audit entries. Reuse `components/admin/*`, `AdminHeading`, `runWithAlerts`, `peso`.
- **Alerts (section 3) is a real bug fix** and may touch `app/api/push/subscribe/route.ts`, `components/notifications/settings.tsx` and a small new read route. No schema change is needed.
- Brand tokens: primary `#0A47B1`, dark `#0A3D91`, light `#EAF4FF` / `#F3F9FF`, text `#0F2342`, muted `#5B6F89`, borders `#E3EEF9` / `#D6E6F7`, success `#12703A` on `#E3F7EA`, warning `#8A5A00` on `#FFF2D6`, danger `#A12A2A` on `#FDE8E8`. Inter headings, Work Sans body.
- Accessibility: 44px touch targets, visible focus rings, tabs use `role="tablist"` / `role="tab"` / `aria-selected`, switches use `role="switch"` and `aria-checked`, dialogs trap focus and close on `Esc`, text 13px or larger, `prefers-reduced-motion` respected.
- Amounts and references are never truncated. Times in Asia/Manila.

## 0. Look at the code first and report
Open `app/admin/topups/page.tsx`, `components/admin/payment-admin.tsx` (`AdminTopupReview`), `components/admin/online-topups.tsx`, `app/admin/settings/page.tsx`, `components/admin/platform-settings-form.tsx`, `admin-payment-settings.tsx`, `payment-hardening-settings.tsx`, `cancellation-settings.tsx`, `PickupSettings.tsx`, `alert-settings.tsx`, `admin-shell.tsx`, `app/api/push/subscribe/route.ts`, `lib/notifications/push.ts`, `lib/notifications/push-endpoint.ts`, `components/notifications/settings.tsx`, `push-opt-in-prompt.tsx`, `public/sw.js`, and where sign-out happens. Report differences from this file, and which settings fields live in which existing form (the designs group some fields differently).

## 1. Owner top-ups (admin, mobile)
**What is confusing today:** manual top-ups and online top-ups sit on one long page. Online top-ups are a cramped grid with no clear "does this need me?", and test payments look the same as real ones.

Boards: *to verify*, *online*, *confirm before adding*.
1. Heading "Owner top-ups", subtitle "Credits that owners paid for."
2. A 3-tab segmented control: **To verify {n}** (manual top-ups with status pending), **Online {n}**, **History** (posted and rejected manual top-ups, same data as today's history). Tab and any filter are kept in the URL (`?tab=`) so refresh keeps the place.
3. **To verify:** one-line blue note "Open your GCash or Maya app and check the money arrived before you verify." One card per top-up: owner, method · time, amount (large), reference the owner typed, proof thumbnail with **View proof** (existing signed-URL logic), buttons **Verify** and **Reject** (same actions and reject-reason dialog as today).
4. **Verify opens a confirm sheet** (bottom sheet) titled "Add ₱{amount} to {owner}?" with the same two fields the current approval already requires (amount received, reference from your app), a required checkbox "I saw this payment in my own app." (UI only, enables the button), buttons **Verify and add credits** and **Cancel**, and the line "Saved to the audit log." The same RPC and validation run as today; show a mismatch with the owner's claimed amount clearly, never overwrite silently.
5. **Online tab:** filter chips All / Needs review / Paid / Waiting (created, failed, expired grouped as "Waiting" or shown by their own status). Each card: owner, method · time, amount, status chip, order id, a "Test" chip when `livemode` is false, and **one plain sentence**:
   - Paid: "Credits were added automatically. Nothing to do."
   - Needs review: "The payment arrived but credits were not added. Check QuickPay, then adjust credits on the owner page." with buttons **Open owner** (existing link) and **Adjust credits** (the existing action on the owner page).
   - Waiting or expired: "No money received yet." / "Expired. No money received."
   Use `provider` to name QuickPay or BayadGate as the current text does.
6. Counts on the tabs and chips come from the data the page already loads. Empty states keep today's messages. Desktop keeps today's two sections.
7. If the online top-up query fails, the tab shows the existing "Could not load online top-ups." message and the other tabs still work.

## 2. Platform settings (admin, mobile)
**What is confusing today:** about six forms stacked on one page, each with its own Save button, the dangerous "Pause new bookings" checkbox buried inside "New owner defaults", and numbers without units or examples.

Boards: *home*, *payment timing*, *confirm changes*, *pause bookings*.
1. **Settings home (below `lg`)** at `/admin/settings`: heading "Settings", subtitle "Rules for the whole platform."
   - Top card **New bookings are on / paused** with a switch (`role="switch"`). Toggling opens the **Pause new bookings?** sheet (board *pause bookings*): "Customers will not be able to send new booking requests until you turn this back on. Existing bookings, payments and pickups are not affected. Customers can still browse vehicles." Buttons **Pause new bookings** (danger) and **Cancel**. Resuming uses a lighter confirm. Saving uses the same `bookings_paused` upsert, with the same audit entry and `updated_by`, as the current form. This is the only behavior change: the switch saves on its own instead of with the defaults form; report it.
   - Grouped list rows (label, current value in one line, chevron):
     - **Owners and fees:** New owner defaults (default commission), Credits and listing (`min_credit_to_list`, `credit_low_threshold`), Invoices (`invoice_grace_days`).
     - **Bookings and payments:** Payment timing, Cancellation, Pickup rules.
     - **Customer-facing:** Rental policies (last edited date), Platform payment QR (`platform_account_name`, `platform_qr_path`, `payment_instructions`).
     - **Notifications:** Email alerts, Phone alerts (links to the notifications page, with "On this phone · {n} devices").
   - Footer: "Each page saves by itself. Changes go to the audit log."
2. **Sub-pages** (mobile): `/admin/settings/{section}` for each row, back link "Settings", the page heading plus one-line subtitle, and the **existing form component and validation** for that section. A section page may combine fields only when they already save through the same existing form or function. If a design grouping would need a logic change (for example the deposit percentage lives in `admin-payment-settings.tsx`), keep each field with its existing form and report the mapping instead of changing the logic.
3. **Number fields** (payment timing, credits, grace days): label, one-sentence plain explanation, unit ("hours", "days", "%"), and minus / plus steppers (44px) next to the input; keep the same min, max and step as the current inputs. Changed fields get a light-blue highlight.
4. **Payment timing page** shows a short worked example under the fields, built from the current values: "A customer books at 9:00 AM. They must pay by 9:00 AM tomorrow. After they upload, the owner has 12 hours to confirm." (The numbers are computed from the form values, not hard-coded.)
5. **Sticky save bar** on each sub-page: **Discard** and **Save {n} changes**, visible only when something changed. Saving opens the **confirm changes** sheet listing each change as "old to new" plus "They apply to new bookings only. Bookings already made keep their old times." where that is true for the setting. This restyles the existing `runWithAlerts` confirm; same text content, same save calls, same success toast, same audit entries. Unsaved changes prompt before leaving the page.
6. **Desktop:** `/admin/settings` renders the current single page exactly as today. On desktop the section routes redirect to `/admin/settings` (or render the same form without the mobile chrome).
7. If a value cannot be loaded, show that row as "Could not load" and keep the rest working; never break the page.

## 3. Phone alerts on multiple devices (bug fix + UI)
**Root cause (from the code):**
- `push_subscriptions.endpoint` is **unique across all users**. A phone or browser profile has exactly one push endpoint for the site.
- `POST /api/push/subscribe` inserts a row for the signed-in user. If that endpoint already belongs to **another account**, the insert hits the unique constraint, the update is scoped to the current user, finds nothing, and returns **409 "This device is linked to another account."** This happens whenever a different account (a test account, a family member, another role) turned alerts on from the same phone or browser first.
- **Signing out does not remove the subscription**, so the first account keeps getting alerts on that phone after someone else signs in. This is also a privacy problem.
- `NotificationSettings` decides "alerts are on" from the **browser's** local subscription, not from the server, so it can show "Turn off" while the server row belongs to someone else, and there is no list of devices.
- One account on several devices already works (one row per device). The failure is the same device used by two accounts.

**Fixes:**
1. **Re-link on conflict** in `POST /api/push/subscribe`. The caller already proves control of the device by sending a valid subscription (endpoint, `p256dh`, `auth`). When the endpoint exists for another user, and the request is same-origin, signed in, and passes the existing `trustedPushEndpoint` and key-format checks, **reassign the row** (`update ... set user_id = current, p256dh, auth, user_agent` where `endpoint = ...`) instead of returning 409. Keep the existing allowlist and SSRF protections. Keep all writes server-side with the service role; do not re-grant client writes. Write a server log line (no personal data) when a re-link happens.
2. **Check before you switch.** Extend `GET /api/push/subscribe?endpoint=` to return `state`: `"mine"`, `"other"` (endpoint exists for another user) or `"none"`. Do not return the other account's identity. The designs show a masked email as an option; **implement the plain wording "another account"** and do not disclose who it is.
3. **Settings screen state comes from the server.** On load, read the browser subscription, then call GET and show: *On* (`mine`), *Off* (`none` or no browser subscription), or *Linked to another account* (`other`). For `other`, **Turn on alerts** opens the "This phone is set up for another account" sheet (mobile) or dialog (desktop): "Alerts on this phone currently go to another account. Switch them to your account? That account will stop getting alerts on this phone. Only switch on a phone you use." Buttons **Switch alerts to my account** (does the POST that re-links) and **Not now**.
4. **Devices list.** New `GET /api/push/devices` (authenticated, same-origin) returns the current user's rows: `id`, parsed device name and kind from `user_agent` (for example "Chrome on Android", with a phone or laptop icon), `created_at`, `last_used_at`. The page shows them under "Your devices ({n})" with a **This device** chip (compare to the browser's endpoint) and **Remove** on the others (`DELETE` by `id` scoped to the current user, with a confirm). Hint text: "To get alerts on another phone or laptop, sign in there and tap Turn on alerts. Each device is set up on its own." Show last alert time from `last_used_at`.
5. **Sign-out choice.** When the user signs out on a device that has alerts on for the current account, show the sheet "Sign out of Kuyog Bohol?" with **Stop alerts and sign out** (primary; calls `DELETE` for this device's endpoint, unsubscribes locally, then signs out), **Keep alerts and sign out**, and **Cancel**, plus the line "On a shared phone, choose Stop alerts." Skip the sheet when there is no subscription for this device. Do the same on the admin, owner and customer sign-out paths that exist.
6. **Help state** for permission denied and iPhone: "Can't turn on alerts?" with Android and iPhone tabs. iPhone: open in Safari, Share, Add to Home Screen, open the installed app, then Notifications, Turn on alerts. Android: use the browser's site settings to allow Notifications. Show this when `Notification.permission === "denied"`, when push is unsupported, or when iOS is not installed (the current blue note moves into this component). Include a support-email link.
7. **Messages.** Replace raw errors with plain ones: "This phone is set up for another account" (never "409"), "Notifications are blocked in this browser", "Alerts are not set up on the server yet" when the VAPID key is missing.
8. Keep `push_enabled` in `notification_preferences` consistent: re-linking sets it true for the new user; removing the last device does not force it false for other devices.

**Security checks to keep:** same-origin check on every write, authenticated user required, trusted push-service host allowlist, private and reserved network blocking in the delivery worker, rate limit on subscribe (reuse the existing limiter if one exists, otherwise a small per-user limit), no other user's data in any response.

## 4. Loading, empty and error states
Top-ups and settings keep their existing `loading.tsx` behavior and add mobile skeleton cards where the current skeleton is table-shaped. The devices list shows a skeleton row and a plain error with **Try again** if it fails; the rest of the notifications page still works. Follow `kuyog-bohol-connection-states.md` for slow connections.

## 5. Tests
1. 390px: Top-ups shows tabs and cards; Settings shows the grouped home list; at 1280px both pages are pixel-identical to before.
2. Top-ups: counts match the data; Verify opens the sheet, the button stays disabled until the checkbox and fields are valid, and the same RPC, validation and audit entry run; Reject keeps its reason dialog; online Paid rows show no actions; Needs review rows link to the owner and Adjust credits; Test chip shows for sandbox payments.
3. Settings: each row opens the right form; saving writes the same keys, `updated_by` and audit entries as before; unsaved changes prompt; the pause switch asks for confirmation, saves, and the public booking button reacts exactly as it does with the old checkbox.
4. **Alerts, account A then B on one phone:** A turns alerts on. A signs out choosing **Keep alerts**. B signs in and taps Turn on alerts: the switch sheet appears; **Switch alerts to my account** succeeds; A no longer gets alerts on that phone and B does. Repeat with A choosing **Stop alerts and sign out**: B turns alerts on with no warning.
5. One account, two devices: both appear in Your devices, each with the right name; Remove on the other device works and that device stops receiving alerts; the current device cannot be removed by mistake.
6. A request that tries to re-link with an invalid, untrusted or malformed subscription is rejected; a cross-origin request is rejected; a signed-out request is rejected.
7. Denied permission, iPhone not installed, and missing VAPID key each show the right help text and no raw error.
8. Keyboard and screen reader: tabs, switches, sheets and dialogs behave as in the accessibility rule; focus returns to the trigger on close.
9. `npm run lint`, `npx tsc --noEmit`, `npm run build`.

## Out of scope
Changes to top-up crediting, QuickPay or webhook logic, settings values or validation rules, admin desktop pages, per-device alert preferences, push for users who are signed out.

## Codex prompt
*"Read `kuyog-bohol-admin-topups-settings-alerts.md`. First report how the admin top-ups and settings pages, the push subscribe route and the notification settings component work today, and which settings fields live in which form. Then implement, mobile only for admin, the tabbed Owner top-ups page with the verify confirm sheet and the plain-language online tab, the grouped Settings home with section pages, sticky save bar, confirm-changes sheet and the pause-bookings switch; and fix the alerts bug: re-link a device that belongs to another account after a confirmation, make the settings state come from the server, add the devices list with Remove, and add the sign-out choice. Keep admin desktop pages unchanged, add no business-logic, RLS or schema changes, keep every existing action, validation and audit entry, and keep the push security checks. Run lint, typecheck and build, compare 1280px screenshots before and after, run the tests in section 5, and list anything you could not verify."*
