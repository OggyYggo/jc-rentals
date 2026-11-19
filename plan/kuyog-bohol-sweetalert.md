# Kuyog Bohol — SweetAlert2 for the Owner and Admin Dashboards (Implementation Spec for Codex)

**Library:** SweetAlert2 — package `sweetalert2` (https://sweetalert2.github.io/). "Sweet alert" in this spec means SweetAlert2.
**Repo:** `OggyYggo/jc-rentals` (Next.js 16 App Router, React 19, TypeScript, Tailwind 4, shadcn/base-ui).
**Scope:** `/owner/*` and `/admin/*` dashboards. The customer portal may reuse the same helper later (section 9), but it is not required.
**Goal:** replace the browser's ugly `window.confirm` boxes and the scattered red error text with consistent, branded confirmations, reason prompts, success toasts and error dialogs. It must stay fast, accessible and safe.

---

## 0. What exists today

- There is **no** alert or toast library. `window.confirm` is used in 3 files:
  - `components/owner/booking-workflow.tsx` (status changes, *Record ₱… as received*)
  - `components/owner/car-manager.tsx` (*Remove this vehicle photo?*)
  - `components/customer/booking-list.tsx` (*Cancel booking …*)
- Results and errors are shown with a local `error` string in each component (`setError(...)`), for example in `components/admin/owner-manager.tsx`, `car-manager.tsx`, `customer-manager.tsx`, `owner-applications.tsx`, `owner-payment-terms.tsx`, `components/owner/credits.tsx`. Successes often show nothing at all.
- Owner components: `booking-workflow`, `calendar-manager`, `car-manager`, `credits`, `payment-review`, `payment-settings-form`, `promo-*`. Admin components: `admin-invoices`, `booking-manager`, `car-manager`, `customer-manager`, `owner-applications`, `owner-manager`, `owner-payment-terms`, `payment-admin` (top-ups), `platform-settings-form`, `admin-payment-settings`.
- Brand: blue `#0B63CE`, deep `#0A3D91`, focus `#2E9BF0`, text `#0F2342`, secondary `#51657F`, border `#D6E6F7`, soft `#EAF4FF`, error `#C62828`, success `#1E8E5A`. Fonts: Inter (headings, buttons), Work Sans (text). Radius: cards 22px, controls 12px, pills 999px.

## 1. Rules

1. **Use SweetAlert2 only for:** (a) confirming an action that changes or removes something, (b) asking for a required reason, (c) success feedback after a saved action (toast), (d) errors that need attention (modal) or short errors (toast), (e) special notices such as the plan limit.
2. **Do not use it for:** field validation (keep inline errors next to the field with `aria-describedby`), loading states for quick actions (keep button spinners from the loading-indicators spec), or every small message. Rule of thumb: if the user can ignore it, it is a toast; if they must decide, it is a dialog.
3. **Never pass user or database text through the `html` option.** Booking references, names, owner notes, car names and error messages are untrusted. Use `title`, `text`, or build the DOM with `textContent`. If markup is unavoidable, escape with a helper first. This prevents XSS.
4. **Server stays the authority.** A confirmation is UX only. Every action must still be validated and authorized on the server and in the database (RLS, definer functions). Required reasons are validated again on the server.
5. **Lazy load.** Load the library only when an alert is shown: `const Swal = (await import("sweetalert2")).default`. It must not be in the public customer pages' bundle.
6. **Accessibility:** keep SweetAlert2's built-in focus trap and ARIA roles. Dangerous confirmations focus **Cancel** by default (`focusCancel: true`). Toasts use `role="status"`/polite announcements (library default). Respect `prefers-reduced-motion` (disable the show and hide animations).
7. **One look.** All dialogs use the shared theme (section 3). No per-file colors.
8. **Copy:** short and plain, with the object in the title: *Remove this photo?* not *Are you sure?*. Button labels name the action (*Remove photo*, *Approve application*), never *OK* or *Yes*.

## 2. Setup

```bash
npm i sweetalert2
```

Check the current docs of the installed version for option names and adapt if needed. Do not add `sweetalert2-react-content` (we do not render React inside alerts).

Files to create:

```
lib/alerts/
  swal.ts        // lazy import, theme, reduced-motion handling, single instance helper
  confirm.ts     // confirmAction, confirmDanger, promptReason
  toast.ts       // toastSuccess, toastError, toastInfo
  errors.ts      // friendlyError(error) maps database/server errors to messages and actions
  run.ts         // runWithAlerts(): confirm -> run -> toast/error in one call
app/globals.css  // small .swal2-* overrides for brand (section 3)
```

## 3. Theme

Shared options (in `swal.ts`):

- `confirmButtonColor: "#0B63CE"`, cancel button neutral (`#EAF4FF` background, `#0A3D91` text). **Danger variant:** confirm button `#C62828`.
- `customClass`: `popup` (radius 22px, padding 28px, border `1px solid #D6E6F7`, soft shadow), `title` (Inter 20px 700 `#0F2342`), `htmlContainer` (Work Sans 15px `#51657F`), `confirmButton` / `cancelButton` (pill radius 999px, height 44px, Inter 600, visible focus ring `#2E9BF0` 3px), `input` / `textarea` (radius 12px, 1px `#D6E6F7`, focus ring `#2E9BF0`).
- Icons: use the built-in `success`, `error`, `warning`, `question` icons but recolor via CSS to the brand tokens (`#1E8E5A`, `#C62828`, `#B7791F`, `#0B63CE`).
- `buttonsStyling: false` with the classes above (Tailwind), or the default styling with colors set. Pick one approach and use it everywhere.
- `reverseButtons: true`, `heightAuto: false`, `returnFocus: true`, `scrollbarPadding: false`.
- Toast defaults: `toast: true`, `position: "top-end"` on desktop and `"top"` on mobile (<640px), `timer: 3200` (errors `6000`), `timerProgressBar: true`, pause on hover (`didOpen` set `onmouseenter = Swal.stopTimer`, `onmouseleave = Swal.resumeTimer`), no backdrop, max width 360px, no focus steal (`focusConfirm: false`).
- Mobile (390px): dialogs use the full width minus 16px margin, buttons stack, text never overflows.
- Respect z-index with the sticky shells (`admin-shell`, `owner-shell`): dialogs above (`z-index` 1060 default is fine; check drawers).
- Animations: when `matchMedia("(prefers-reduced-motion: reduce)")` matches, pass `showClass: { popup: "" , backdrop: "" }` and `hideClass: { popup: "", backdrop: "" }`.

## 4. Helper API (what components call)

```ts
// confirm.ts
confirmAction({ title, text?, confirmText, cancelText? }): Promise<boolean>
confirmDanger({ title, text?, confirmText }): Promise<boolean>          // red button, focus Cancel
promptReason({ title, text?, label, placeholder?, confirmText,
               minLength = 3, maxLength = 300, required = true }): Promise<string | null>  // null = cancelled

// toast.ts
toastSuccess(message: string): Promise<void>
toastError(message: string): Promise<void>
toastInfo(message: string): Promise<void>

// errors.ts
friendlyError(error: unknown): { title: string; text: string; action?: { label: string; href: string } }

// run.ts
runWithAlerts<T>(opts: {
  confirm?: { title: string; text?: string; confirmText: string; danger?: boolean };
  reason?: { title: string; label: string; confirmText: string };       // asks for a reason first
  run: (reason?: string) => Promise<T>;                                   // server action or rpc call
  success?: string | ((result: T) => string);
  refresh?: () => void;                                                   // router.refresh()
}): Promise<{ ok: true; data: T } | { ok: false }>
```

Behavior details:
- `promptReason` uses a textarea with `inputValidator` (trimmed length between `minLength` and `maxLength`; message *Please give a reason (3 to 300 characters).*), `inputAttributes: { maxlength }`, and returns the trimmed string. Never use `html` for the label.
- `runWithAlerts` shows a loading state **only when the action takes longer than about 600ms** (`Swal.showLoading` with a non-dismissable dialog titled *Please wait…*); fast actions rely on the button spinner already in the component. It always closes the loading dialog and then shows a toast on success or an error dialog (or toast for minor errors) on failure. It prevents double submits (ignore a second call while one is running).
- `friendlyError` maps known messages to plain language and never shows raw SQL, stack traces or tokens. Known cases:

| Source | Message shown | Extra |
|---|---|---|
| `CAR_LIMIT_REACHED` / `VEHICLE_LIMIT_REACHED` | *You have reached your plan limit. Upgrade your plan to publish more vehicles.* | button **View plans** → `/owner/plan` |
| `LICENSE_CLASS_REQUIRED` | *This customer's license is not verified for this vehicle type.* | none |
| `Administrator access required.` | *You do not have permission to do this.* | none |
| network error / fetch failed | *We could not reach the server. Check your connection and try again.* | none |
| anything else | the server's safe message if it is a known friendly string, otherwise *Something went wrong. Please try again.* | log details to the server only |

## 5. Owner dashboard: where to use it

| Screen (file) | Action | Alert |
|---|---|---|
| Bookings (`components/owner/booking-workflow.tsx`) | Accept / confirm booking | `confirmAction` (*Confirm this booking?*), success toast *Booking confirmed* |
| | Decline / cancel booking | `promptReason` (reason required) → toast |
| | **Record ₱X as received** | `confirmAction` showing the **amount and booking reference as plain text** (*Record ₱3,000 as received for KB-1234?*) → toast *Payment recorded* |
| | Mark picked up / completed | `confirmAction` → toast |
| | Deposit refunded | `confirmAction` with amount → toast |
| Payments (`payment-review.tsx`) | Approve or reject a customer's payment proof | Approve: `confirmAction`; reject: `promptReason` (reason shown to customer) |
| Vehicles (`car-manager.tsx`) | Remove a photo | `confirmDanger` (*Remove this photo?*) → toast |
| | Publish / hide vehicle | `confirmAction` (hide: explains it will disappear from search) → toast |
| | Delete vehicle (if it exists) | `confirmDanger` with the vehicle name as text |
| | Publish blocked by plan limit | Error dialog from `friendlyError` with **View plans** button |
| | Save vehicle | toast *Vehicle saved* |
| Credits (`credits.tsx`) | Top-up submitted | toast *Top-up sent for review* (and info text that review takes time) |
| Payment settings (`payment-settings-form.tsx`) | QR saved | `toastInfo` *Saved. Your QR will be checked before customers can pay you.* |
| Calendar (`calendar-manager.tsx`) | Block dates / remove a block | Remove: `confirmAction`; success toast |
| Plan (`/owner/plan`, when built) | Plan payment submitted | toast *Payment sent for review*; approved/rejected states come from notifications |
| Promo kit | Link copied / download started | `toastSuccess` (*Link copied*) |

## 6. Admin dashboard: where to use it

| Screen (file) | Action | Alert |
|---|---|---|
| Owner applications (`owner-applications.tsx`) | **Approve** | `confirmAction` summarizing the effect as plain text: *This creates an owner account and sends an invite email to {email}.* → toast |
| | **Needs changes** / **Reject** | `promptReason` (required; shown to the applicant) → toast |
| Customers (`customer-manager.tsx`) | Approve or reject verification | Approve: `confirmAction`; reject: `promptReason`; license classes: confirm saving (when built) |
| | View document | no alert (opens signed URL); on failure `toastError` |
| Owners (`owner-manager.tsx`) | Create owner | success toast; failure error dialog |
| | Change commission, fee mode or deposit | `confirmAction` showing **old → new** values (*Commission 5% → 3%. Applies to new bookings only.*) |
| | Deactivate / reactivate owner | `confirmDanger` for deactivate (explains that their cars disappear from search); success toast |
| Owner payment terms (`owner-payment-terms.tsx`) | Save terms, verify QR | `confirmAction` for verify (*Mark this QR as verified?*) → toast |
| Top-ups (`payment-admin.tsx`) | Approve top-up | `confirmAction` with amount and owner → toast; Reject → `promptReason` |
| Invoices (`admin-invoices.tsx`) | Generate monthly invoices | `confirmAction` (*Generate invoices for {month}?*) with `runWithAlerts` loading dialog (can take longer) → toast with the count created |
| | Mark invoice paid | `confirmAction` with amount → toast |
| Cars (`car-manager.tsx`) | Deactivate / reactivate vehicle | `confirmDanger` / `confirmAction` → toast |
| Bookings (`booking-manager.tsx`) | Cancel or change a booking | `promptReason` → toast |
| Platform settings (`platform-settings-form.tsx`) | Change the default commission or text | `confirmAction` showing old → new, noting *Applies to new bookings only.* |
| Plans (when built): plan payments queue, plan edit, owner plan override | Approve/reject plan payment; **Apply now** to current subscribers; override | Same patterns: confirm with the numbers, reason for rejects |
| Messages (contact inbox, when built) | Mark spam or resolved | `confirmAction` for spam; toast |

## 7. Implementation steps

1. Install `sweetalert2`; create `lib/alerts/*` and the CSS overrides; write unit tests for `friendlyError` and for the reason validation (pure functions).
2. Replace the **5 existing `window.confirm` calls** first (owner and customer files listed in section 0). Keep behavior identical, only the UI changes. Remove the `window.confirm` imports.
3. Convert the component-level `error` strings for **action results** to `runWithAlerts` (errors) and add success toasts. Keep **form field errors** inline.
4. Add confirmations to the owner actions (section 5), then the admin actions (section 6).
5. Add the plan-limit error with the **View plans** button once the plans spec is built.
6. Search the repo for leftovers: `window.confirm`, `alert(`, `prompt(`; none may remain in `/owner`, `/admin` or the shared components.
7. Final pass for accessibility, mobile (390px) and bundle size.

Rules while converting:
- Preserve all existing server-side calls and permissions; do not move business logic into the alert helpers.
- Disable the triggering button while the action runs and re-enable it when it finishes (existing `busy` state); ignore repeated clicks.
- After a successful action call `router.refresh()` as the component already does.
- Keep messages free of secrets (tokens, signed URLs, bank details, full documents).

## 8. Security checklist

- [ ] No `html:` option is used with dynamic or user-controlled text anywhere (search the repo).
- [ ] Reasons are trimmed, length-limited and validated again on the server before saving or showing to others; displayed later as plain text.
- [ ] Alerts never display raw SQL, error stacks, signed URLs or tokens; `friendlyError` is the only place errors become text.
- [ ] Confirmations do not replace authorization: all actions still enforce roles and RLS on the server.
- [ ] No sensitive data (bank numbers, full ID numbers) in alert text.
- [ ] The library is loaded lazily and only in `/owner` and `/admin` code paths.

## 9. Optional: customer portal

`components/customer/booking-list.tsx` also uses `window.confirm` for **Cancel booking**. Switching it to the same helper is a 5-minute change and keeps one style across the app. Customers get toasts for *Booking cancelled* and for the license or plan-style errors from `friendlyError`. Do this after the owner and admin work.

## 10. Test plan

- Each replaced action: cancel path does nothing; confirm path runs once; success shows a toast; failure shows an error and the button is usable again.
- `promptReason`: empty, whitespace only, 2 characters and 301 characters are refused with the message; valid text is trimmed and sent.
- Keyboard: Tab stays inside the dialog, Escape cancels, Enter confirms (except in the textarea), focus returns to the triggering button; danger dialogs start on Cancel.
- Screen reader: dialog announced with its title; toasts announced politely.
- Reduced motion: no animation; toasts still readable.
- Mobile 390px: dialogs fit, buttons stack, toasts do not cover the bottom nav.
- Slow network: loading dialog appears only after about 600ms; double clicks create one request.
- XSS test: a booking reference or reason like `<img src=x onerror=alert(1)>` renders as plain text in every dialog and toast.
- Bundle: public pages (landing, `/cars`, `/apply`) do not include the library; `/owner` and `/admin` load it on demand.
- `npm run lint`, `npx tsc --noEmit`, `npm run build`.

## 11. Acceptance checklist

- [ ] `sweetalert2` installed and loaded lazily; shared theme matches the brand (blue primary, red danger, Inter and Work Sans, pill buttons).
- [ ] No `window.confirm`, `alert()` or `prompt()` remains in the owner and admin dashboards.
- [ ] Every action in sections 5 and 6 has the specified confirmation, reason prompt or toast.
- [ ] Reason prompts require 3 to 300 characters and are re-validated on the server.
- [ ] Errors go through `friendlyError`; the plan-limit error offers **View plans**.
- [ ] Field validation errors stay inline and are not shown as popups.
- [ ] Dialogs and toasts are accessible, keyboard friendly, reduced-motion safe and work at 390px.
- [ ] No dynamic text is rendered through `html:`.
- [ ] Lint, typecheck and build pass; public pages' bundle size is unchanged.

## 12. Codex prompt

*"Add SweetAlert2 to the owner and admin dashboards following `kuyog-bohol-sweetalert.md`. Install `sweetalert2`, build `lib/alerts/*` (lazy import, brand theme, confirm, reason prompt, toasts, friendlyError, runWithAlerts), then replace the 5 existing `window.confirm` calls, then add confirmations, reason prompts and toasts to the owner and admin actions in sections 5 and 6. Keep field validation inline. Never use the `html` option with dynamic text. Keep all server-side validation and permissions as they are. Run lint, typecheck and build, report the bundle impact on public pages, and list anything you could not verify."*
