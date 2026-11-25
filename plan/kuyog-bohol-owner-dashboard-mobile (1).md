# Kuyog Bohol — Owner Workspace Dashboard: Mobile Refinement (Instructions for Codex)

Refines the **owner dashboard on phones** and adds a **bottom navigation bar** for the owner workspace. Designs are on the design canvas: boards **"Owner: dashboard (mobile)"** and **"Owner: menu (mobile)"**.

> Next.js 16 here has breaking changes. Read the relevant guide in `node_modules/next/dist/docs/` before changing layouts, routes or data fetching.

## Rules
- **Mobile only.** The desktop dashboard (`sm` and up) and the desktop sidebar (`lg` and up) must look and behave **exactly as today**. Use Tailwind responsive classes (`sm:hidden`, `lg:hidden`, `hidden sm:block`) and compare desktop screenshots (1280px) before and after.
- **No new database tables or functions.** Reuse data already loaded by `app/owner/page.tsx` and `app/owner/layout.tsx`. Any extra data must come from a small extra query with the existing `supabase` client and owner id (list each one in your report).
- Do not change business logic, payment rules, or the content of other owner pages.
- Brand tokens: primary `#0A47B1`, dark `#0A3D91`, light `#EAF4FF` / `#F3F9FF`, text `#0F2342`, muted `#5B6F89`, borders `#E3EEF9` / `#D6E6F7`, success `#12703A` on `#E3F7EA`, warning `#8A5A00` on `#FFF2D6`, danger `#A12A2A` on `#FDE8E8`, badge red `#D92D20`. Inter for headings, Work Sans for body.
- Accessibility: 44px minimum touch targets, visible focus rings, `aria-label` on icon-only buttons, `aria-current="page"` on the active tab, badges include a screen-reader label ("2 deposits to review"). Respect `prefers-reduced-motion`.

## 0. Look at the code first and report
Open and confirm: `app/owner/page.tsx` (the dashboard; it already has separate mobile blocks using `sm:hidden`), `app/owner/layout.tsx` (note: its `pendingBookings` prop is actually the count of bookings in `payment_review`, i.e. **deposits to review**; the dashboard variable `pendingCount` is the count of `pending` **booking requests**, a different thing), `components/owner/owner-shell.tsx` (sidebar at `lg`, hamburger drawer below), `components/owner/ui.tsx` (`PageHeading`, `StatCard`, `StatusPill`, `formatPeso`, `formatShortDate`), `components/owner/credit-state.tsx`, `components/pickup/ScanPickupLink.tsx`. Report anything that differs.

Current mobile experience (verified): a hamburger menu with 11 items, a heading with a small scan button, a thin credits/refunds/reviews strip, **Recent bookings first**, then four 2-column stat cards with small text, the earnings chart, a breakdown card and a fleet card. Nothing tells the owner what to do first.

---

## 1. Bottom navigation bar (owner workspace, below `lg`)

File: `components/owner/owner-shell.tsx` (and the page container padding).

1. A fixed bottom bar, visible only below `lg` (`lg:hidden`), white with a top border and soft shadow, respecting the safe area (`pb-[env(safe-area-inset-bottom)]`). Five slots:
   - **Home** → `/owner` (active when `pathname === "/owner"`).
   - **Bookings** → `/owner/bookings`, with a badge for booking requests waiting (`pending` status count).
   - **Scan** (center, raised circular 60px button, primary blue, white scan icon, white 4px ring) → use `ScanPickupLink` so it opens the scanner exactly as the existing scan buttons do. It has `aria-label="Scan pickup pass"`.
   - **Payments** → `/owner/payments`, with a badge for deposits to review (the layout's `pendingBookings` value, which is the `payment_review` count).
   - **More** → opens the existing mobile menu drawer (section 2). Active while the drawer is open.
2. Badges: red circle, white number, hidden when the count is 0, "9+" above 9.
3. Pass the booking-request count into the shell as a new prop (for example `bookingRequests`), computed in `app/owner/layout.tsx` with one more `head: true` count query (`status = 'pending'`, same owner filter) added to the existing `Promise.all`. Do not rename the existing `pendingBookings` prop; only add the new one.
4. Add bottom padding to the page content on mobile (`pb-28 lg:pb-0`) so nothing hides behind the bar. The hamburger button in the top header can stay, but on mobile the header should show only: logo, notification bell, avatar (the existing hamburger can be hidden below `lg` because **More** replaces it; keep it on `lg` only if it exists there today).
5. Hide the bar while the scanner camera view is open if it overlaps controls (check `/owner/scan`).

## 2. "More" menu (mobile)

Reuse the existing mobile drawer content, but present it as a full-height bottom sheet or the existing drawer, with the 11 links **grouped**:
- **Operations:** Calendar, My cars (label "My vehicles"), Reviews (with the unanswered-reviews badge), Promote.
- **Money:** Credits, Earnings, Payment settings, Plans and pricing.
- **Help:** Contact Kuyog Bohol support (`/contact`), Sign out (use the existing sign-out action or link).
At the top: avatar with initials, business name, email. Home, Bookings and Payments are in the bottom bar, so they are not repeated in the groups. Close on navigation, on backdrop tap and on `Esc`. Trap focus while open.
The desktop sidebar keeps its current flat list unchanged.

## 3. Dashboard page (mobile, below `sm`)

File: `app/owner/page.tsx`. Build one new mobile layout (a `sm:hidden` block, for example a new component `components/owner/mobile-dashboard.tsx` fed with the data the page already has) and **hide the old mobile-only blocks** that it replaces (`sm:hidden` credits strip and the mobile copy of recent bookings). Leave the `hidden sm:...` desktop blocks untouched.

Order, top to bottom:
1. **Greeting:** small date line (`Wed, Nov 25`, Manila time) and "Good morning, {first word of business name or owner name}" (use "Good afternoon" and "Good evening" by Manila time; the current text is always "morning").
2. **Quick actions:** primary **Scan pickup pass** (flex 1.4, height 50px, via `ScanPickupLink`) and secondary **Add vehicle** (link to the existing add-vehicle entry on `/owner/cars`).
3. **Needs your attention** card with a "{n} tasks" chip (sum of the counts below). Rows (icon tile, title, one short subtitle, count pill, chevron), **shown only when the count is above 0**:
   - Deposits to review: count of `payment_review` bookings → `/owner/payments`.
   - Booking requests: count of `pending` bookings → `/owner/bookings`.
   - Refunds to send: `refunds` (already loaded) → `/owner/payments?tab=refunds`.
   - Reviews to reply: `reviewSummary.unanswered` → `/owner/reviews`.
   If everything is 0, show a calm "You're all caught up" state with a check icon instead of the card.
4. **Earnings card** (blue): label "Your earnings · {Month}", large net earnings (`net`), a percent chip vs. last month only if last month's net is above 0 (compute from the existing `chartMonths`; hide the chip otherwise), a line "Gross {gross} · {rate}% platform fee", and a compact 6-month bar chart on a white inner panel (current month in primary blue, older months in `#C9DAF3`, month labels 10px). Reuse `chartMonths`. Tapping the card opens `/owner/earnings`.
5. **Owner credits** row (only when `showCredits`): icon, "Owner credits", "{amount} available", a "Low" or "No credits" chip using the existing low-threshold logic, and a **Top up** button → `/owner/credits#top-up`.
6. **Coming up:** the next pickups and returns, up to 3 rows, each with a date tile ("TODAY" or "NOV 27" and the time if the booking has one), customer name, vehicle, and a green "Pickup" or blue "Return" chip. Source: the bookings already loaded plus, if needed, one extra query for the owner's `confirmed` and `picked_up` bookings (`start_date >= today` for pickups and `end_date >= today` for returns, ordered by date, limit 6). Use Manila dates. Hide the section when there is nothing. Header link "Calendar →" to `/owner/calendar`.
7. **Recent bookings:** the latest 3 (existing `recent` data): initials avatar, customer name, "vehicle · reference", amount on the right and a `StatusPill` below it (keep the existing "Cancelled (fee kept)" logic). Header link "See all →" to `/owner/bookings`.
8. **Your fleet:** three small count cards (Vehicles, Active, Hidden) from `carList`; "Manage →" to `/owner/cars`. Hidden = vehicles that are not active.
9. Remove from mobile: the four 2-column `StatCard`s (their information moved into the earnings card, attention card and fleet counts), the long "Earnings breakdown" card (keep it on desktop; link to `/owner/earnings` for details), and the old "Here's how your rental business is doing today" description.

Greeting, numbers and money use existing helpers (`formatPeso`, `formatShortDate`, `paymentPeso`). Do not truncate amounts. Text sizes on mobile: body at least 13px, titles 15px, no 9 to 10px text except chart month labels.

## 4. Loading, empty and error states
- Keep the existing `loading.tsx` behavior; add a mobile skeleton that matches the new layout if the current loading UI is desktop-shaped.
- New owner with no data: attention card shows the caught-up state, earnings show ₱0 without a percent chip, "Coming up" and "Recent bookings" are hidden or show one short empty line ("No bookings yet. Share your vehicle link to get started." with a link to `/owner/promote`).
- If an extra query fails, log it server-side (no personal data) and hide that section instead of breaking the page; the existing error handling for the main queries stays.

## 5. Tests
1. At 390px: bottom bar shows Home, Bookings, Scan, Payments, More; the active tab is highlighted; the scan button opens the scanner.
2. Badges match real counts (booking requests, deposits to review) and disappear at 0.
3. **More** opens the grouped menu; every link works; the menu closes after navigation and on backdrop tap.
4. The attention card lists only the tasks with a count above 0 and the numbers match the Bookings, Payments, Refunds and Reviews pages. With all zeros it shows the caught-up state.
5. Earnings card values match the existing desktop "Your earnings" and "Gross" numbers for the same month; the percent chip hides when last month is 0.
6. "Coming up" shows the right dates in Manila time (a booking starting today shows "TODAY").
7. A credits-mode owner sees the credits row with Top up; a non-credits owner does not.
8. Nothing is hidden behind the bottom bar (scroll to the end on iPhone-sized and Android-sized screens, with the browser toolbar visible).
9. At 1280px the dashboard, sidebar and header are pixel-identical to before; at 768px (tablet) nothing breaks (bottom bar shows, dashboard uses the existing layout).
10. Keyboard and screen reader check on the bar and the menu (focus order, labels, `aria-current`).
11. `npm run lint`, `npx tsc --noEmit`, `npm run build`.

## Out of scope
New metrics or database changes, redesigning other owner pages (bookings, payments, cars, calendar), the desktop dashboard, push notification changes.

## Codex prompt

*"Read `kuyog-bohol-owner-dashboard-mobile.md`. First report how the owner shell, layout and dashboard are built today and what data they already load. Then implement, mobile only: the bottom navigation bar with badges and the center Scan button, the grouped More menu, and the new mobile dashboard layout (greeting, quick actions, Needs your attention, earnings card, credits row, Coming up, Recent bookings, fleet counts), hiding the old mobile blocks it replaces. Keep the desktop dashboard, sidebar and header exactly as they are, add no database changes, and keep the existing `pendingBookings` prop meaning (deposits to review) while adding a separate booking-requests count. Run lint, typecheck and build, compare desktop screenshots before and after, run the tests in section 5, and list anything you could not verify."*
