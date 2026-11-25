# Kuyog Bohol — Platform Admin: Mobile UI + Vehicles Page Refinement (Instructions for Codex)

Designs are on the design canvas, row "Platform admin: mobile UI": boards **Admin: dashboard, more menu, owners, car applications, vehicles (mobile), customers, bookings, payments, top-ups, plan payments, fees and credits, commissions, promotions, reviews, platform settings, audit log**, and below it **Admin: vehicles (desktop)**.

> Next.js 16 here has breaking changes. Read the relevant guide in `node_modules/next/dist/docs/` before changing layouts, routes or data fetching.

## Rules
- **Mobile only** (below `lg`) for every admin page **except Vehicles**, which gets a refined mobile **and** desktop layout. All other admin desktop pages and the desktop sidebar must look and behave exactly as today. Use Tailwind (`lg:hidden`, `hidden lg:block`, `sm:`/`md:` overrides) and compare 1280px screenshots before and after.
- **No database, RLS, RPC or business-logic changes.** Reuse the data each page already loads. Server actions, confirm dialogs, reject-reason dialogs, signed-URL logic and audit logging stay exactly as they are.
- Reuse `components/admin/*`, `AdminHeading`, `AdminStat`, `AdminStatus`, `peso` from `components/admin/ui.tsx`. Prefer a mobile card component per page (for example `OwnerCardMobile`) fed with the same row data the table uses, rendered in a `lg:hidden` block next to the existing `hidden lg:block` table.
- Brand tokens: primary `#0A47B1`, dark `#0A3D91`, light `#EAF4FF` / `#F3F9FF`, text `#0F2342`, muted `#5B6F89`, borders `#E3EEF9` / `#D6E6F7`, success `#12703A` on `#E3F7EA`, warning `#8A5A00` on `#FFF2D6`, danger `#A12A2A` on `#FDE8E8`, badge red `#D92D20`. Inter headings, Work Sans body.
- Accessibility: 44px touch targets, visible focus rings, `aria-label` on icon-only buttons, `aria-current="page"` on the active tab, badges with screen-reader text ("8 deposits to review"), `prefers-reduced-motion` respected. Body text 13px or larger.
- Do not truncate amounts or references. Times in Asia/Manila.

## 0. Look at the code first and report
Open: `components/admin/admin-shell.tsx` (15 nav items; check how the mobile drawer works), `app/admin/layout.tsx`, `app/admin/page.tsx`, each page under `app/admin/*`, `components/admin/ui.tsx`, `car-manager.tsx`, `owner-manager.tsx`, `customer-manager.tsx`, `booking-manager.tsx`, `payment-admin.tsx`, `plan-payment-review.tsx`, `platform-settings-form.tsx`, `components/admin/audit/*`. Report which pages already have a mobile layout and which counts the layout already loads (deposits to review, applications, top-ups, etc.). Report differences from this file.

## 1. Admin mobile shell (below `lg`)
File: `components/admin/admin-shell.tsx` and page container padding.
1. **Top bar:** logo, an "ADMIN" chip, notification bell (if one exists today), avatar. The hamburger is replaced by **More**.
2. **Bottom bar** (`lg:hidden`, fixed, white, top border, soft shadow, `pb-[env(safe-area-inset-bottom)]`): **Home** `/admin`, **Bookings** `/admin/bookings`, **Payments** `/admin/payments` (red badge = deposits needing review), **Owners** `/admin/owners`, **More**. Badges hidden at 0, "9+" above 9. Add `pb-28 lg:pb-0` to page content.
3. **More** opens a full-height sheet with grouped links, closes on navigation, backdrop tap and `Esc`, traps focus:
   - **Marketplace:** Car applications (badge), Vehicles, Customers (badge for documents to verify), Owners.
   - **Money:** Top-ups (badge), Plan payments (badge), Fees and credits, Commissions.
   - **Platform:** Promotions, Reviews (badge for reports), Platform settings, Audit log, Sign out.
   Top of the sheet: avatar, "Platform admin", email. Home, Bookings, Payments and Owners are not repeated. The tab for a page opened from More (for example Reviews) shows **More** as active.
4. Badge counts: reuse what the layout loads today; if a count is missing add one `head: true` count query in the layout (list each in your report).

## 2. Page-by-page (mobile)
Common pattern: heading (26px) + one-line subtitle; optional search field; horizontally scrollable filter chips with counts; one card per row; actions at the bottom of the card (primary left, secondary right). Existing filters keep working with the same query params or state. Empty states keep today's message.

1. **Dashboard** (`app/admin/page.tsx`): date line; **Needs attention** card with a "{n} tasks" chip and rows (icon tile, title, one subtitle, count pill, chevron) shown only when count > 0: deposit proofs, open disputes, overdue refunds, customers to verify, vehicle applications, then "Show more" for top-ups, plan payments, review reports. All zero → calm "All caught up". Blue **Platform commission · {Month}** card with gross bookings, bookings, cancellation fees. Three small counts (Owners, Vehicles, Customers). **Pickup activity** bar (percent by scan; scan / manual / override counts). **Email alerts** status row. **Recent activity** (3 audit rows, link "Audit log →") and **Recent bookings** (3). Remove the old 2-column stat grid on mobile only; keep it on desktop.
2. **Owners:** search, chips All / Active / Archived, cards: initials avatar, business, contact, chips (status, fee mode Credits or Invoice, commission %, vehicle count, "Low credits"), buttons **Edit** and **Archive** or **Restore** (same actions and confirm dialog as the table). "+ Add" in the heading if the page has an add action today.
3. **Car applications:** chips New / Needs correction / Approved / Rejected; cards with applicant, vehicle, date, checklist chips (OR/CR, photos, ID: green check, amber partial, red cross), status chip, **Review** and **Request fix** (same dialogs). Footnote only if the current page already says something similar.
4. **Vehicles (mobile)** (`app/admin/cars/page.tsx`, `car-manager.tsx`): see section 3.
5. **Customers:** search, chips All / To verify / Verified / Rejected; cards with name, email, booking count, document chips (License, ID, Selfie) and a status chip; **Review documents** opens the existing `customer-review-dialog` (view only, same rules), **Bookings** links to the existing filtered view.
6. **Bookings:** search, status chips (All, Payment review, Confirmed, Picked up, Completed, Cancelled); cards: reference + status chip, customer · vehicle, owner, dates, total. Tapping opens the same detail/actions as today.
7. **Payments:** the existing tabs (Needs review, Risk flags, Disputes, Refunds, Overdue) become scrollable chips with counts; cards show amount, reference · owner, a provider tile with the payment option label, time-left chip (amber; red under 1 hour or passed), flag chip, **Review deposit** and **Owner**. Same review logic and dialogs. Use the compact owner-style text rules from `kuyog-bohol-owner-ui-refinements.md` but **do not change the owner components**.
8. **Top-ups:** chips To verify / Verified / Rejected; cards with owner, method, time, amount, proof thumbnail (existing signed-URL logic) + reference, **Verify and add credits** and **Reject**. Keep the existing "check the payment in your app first" reminder as one short line.
9. **Plan payments:** chips Waiting / Active / Rejected; cards with owner, plan chip, price, period, vehicle allowance, proof, **Activate plan** and **Reject**.
10. **Fees and credits:** three summary tiles (credits held, low credits, unpaid invoices), then owner cards with fee-mode chip, commission %, credits with a small bar (amber when low), invoice status, **Adjust credits** and **Invoices** (existing actions).
11. **Commissions:** month chips, blue summary (commission, gross, cancellation fees kept), **By owner** list with bars (gross · bookings), 6-month bar chart (current month `#0A47B1`, others `#C9DAF3`). Same month basis as today (booking creation month).
12. **Promotions:** brand-post card ("General brand post", link as today), per-owner cards: clicks and bookings for 30 days, chips by source (post, story, poster, sticker, cover, share). Keep the page's note that referrals do not change commission.
13. **Reviews:** chips Reports / Hidden / All; cards with stars, quote, customer · owner · vehicle, a "Reported" box when reported, **Hide** or **Keep visible** (existing actions).
14. **Platform settings:** section cards (New owner defaults, Policies, Notifications), each row label + value + chevron to the existing control; one full-width **Save changes**; "Changes are written to the audit log" line. Use the existing form and validation; this is a layout change only.
15. **Audit log:** search, chips All / Payments / Security / Settings / Documents (map to existing filters), timeline cards: colored icon tile, action, actor · time (Asia/Manila), detail chip. Keep pagination/infinite behavior as today.

## 3. Vehicles page — mobile and desktop (`app/admin/cars/page.tsx`, `components/admin/car-manager.tsx`)
Data and actions unchanged: search, status filter, vehicle-type filter, Deactivate/Reactivate with confirm.

**Mobile (below `lg`):** heading "Vehicles", subtitle "All owners. Control what customers can see.", search (vehicle, owner, plate), chips All / Active / Hidden / Cars / Motorcycles with counts, one card per vehicle: 72×60 photo (first photo, placeholder if none), name, plate · transmission or helmets, owner, a **visibility switch** (same action as Deactivate/Reactivate, with the same confirm dialog; `role="switch"`, `aria-checked`, label "Show {vehicle} to customers"), chips (status, Self-drive, With driver, photo count, "Missing photos" amber when under 3), rates line, **View** and **Deactivate/Reactivate** buttons.

**Desktop (`lg` and up):** refine the existing table: 4 summary tiles (Vehicles, Visible to customers, Hidden, Need attention) computed from the loaded list; filter bar with search plus Status, Type and **Owner** selects (client-side filter on the loaded list; no new query); table columns Vehicle (72×56 photo, name, plate · transmission), Owner, Rental modes and rates (chips + rates), Photos (green chip 3 photos, amber when fewer), Visibility (switch + "Visible/Hidden" label), **View**; footer "Showing {n} of {total}" with the existing pagination if any. Short note under the table: "Hiding a vehicle removes it from search. Existing bookings are kept." Do not add export or bulk actions.

## 4. Loading, empty and error states
Keep existing `loading.tsx` behavior and add mobile skeleton cards that match the new layouts where the current skeleton is table-shaped. If an extra count query fails, log it server-side (no personal data) and hide that badge or row instead of breaking the page.

## 5. Tests
1. At 390px every admin page uses the new card layout; at 1280px every admin page except Vehicles is pixel-identical to before (screenshots).
2. Bottom bar: five tabs, correct active tab (More active for pages opened from More), badges match real counts and hide at 0. More sheet links all work; closes on navigation, backdrop and `Esc`; focus trapped.
3. Dashboard attention rows match the numbers on Payments, Customers, Applications, Top-ups, Plan payments and Reviews; all zeros shows "All caught up".
4. Each page's existing actions (approve, reject, verify, activate, adjust, archive, hide, save) still work and still write audit log entries.
5. Filters and search give the same results as the desktop table for the same inputs.
6. Vehicles: switch toggles visibility with the confirm dialog; deactivated vehicles disappear from the public site; mobile and desktop show the same data; "Missing photos" shows under 3 photos.
7. No horizontal scroll at 360px; nothing hidden behind the bottom bar (scroll to the end); text 13px or larger.
8. Keyboard and screen reader pass on the bar, sheet and switch.
9. `npm run lint`, `npx tsc --noEmit`, `npm run build`.

## Out of scope
New metrics, database changes, export or bulk actions, redesigning admin desktop pages other than Vehicles, owner and customer screens.

## Codex prompt
*"Read `kuyog-bohol-admin-mobile-ui.md`. First report how the admin shell, layout and each admin page are built today and which counts they already load. Then implement, mobile only, the admin bottom navigation with badges and the grouped More sheet, and the mobile card layouts for all 15 admin pages as described, plus the refined Vehicles page for both mobile and desktop. Keep other admin desktop pages and the desktop sidebar exactly as they are, add no database or business-logic changes, and keep every existing action, dialog and audit log entry. Run lint, typecheck and build, compare 1280px screenshots before and after, run the tests in section 5, and list anything you could not verify."*
