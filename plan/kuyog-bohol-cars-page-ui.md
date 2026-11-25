# Kuyog Bohol — Public Cars Page (`/cars`) UI Refinement, Mobile + Desktop (Instructions for Codex)

Designs are on the design canvas, row "Public Cars page": boards **Cars page: list (mobile)**, **Cars page: filters sheet (mobile)**, **Cars page: no results (mobile)**, **Cars page: desktop**. This is the public page `kuyogbohol.app/cars`, not the admin Vehicles page.

> Next.js 16 here has breaking changes. Read the relevant guide in `node_modules/next/dist/docs/` before changing routes, data fetching or client components.

## Rules
- **UI only.** No change to queries, filtering logic, sorting, `parseCarSearch`, `carsUrl`, URL params, metadata/SEO, `public_pickup_search`/availability lookups, or the car detail page. Every filter keeps the same URL params (`vehicle`, `mode`, `from`, `to`, `pickup`, `type`, `seats`, `transmission`, `minPrice`, `maxPrice`, `rating`, `sort`).
- Files: `app/cars/page.tsx`, `components/cars/VehicleFilterTabs.tsx`, `CarFilterTabs.tsx`, `CarListFilters.tsx`, `components/customer/car-tile.tsx` (also used elsewhere: check every usage and keep those looks acceptable), `app/cars/loading.tsx`, `components/motion/CarGrid.tsx` (keep its animation and `prefers-reduced-motion`).
- Brand tokens: primary `#0A47B1` (current code uses `#0B63CE`; keep existing token for buttons unless the design system already uses `#0A47B1`), dark `#0A3D91`, light `#EAF4FF` / `#F3F9FF`, text `#0F2342`, muted `#5B6F89`, borders `#E3EEF9` / `#D6E6F7`, warning `#8A5A00` on `#FFF2D6`, badge red `#D92D20`.
- Accessibility: 44px touch targets, visible focus rings, `role="tablist"` kept on mode tabs, `aria-live="polite"` on the result count, `role="alert"` on load error, sheet traps focus and closes on `Esc`/backdrop, filter button has an accessible name with the active count ("Filters, 2 active").
- SEO: keep the `<h1>`, intro text (shorter on mobile is fine if the full text stays in the DOM on desktop) and the server-rendered grid.

## 0. Look at the code first and report
Open the files above and report: how `VehicleFilterTabs`, `CarFilterTabs` and `CarListFilters` update the URL, where the `<details>` mobile filters live, and every place `CarTile` is used. Report anything different from this file.

Current problems (verified in code): on phones the page stacks three rows of tabs, a collapsed "Filters" box and a long intro before any vehicle; each card shows up to two white price pills over the photo, specs as three pills and a full-width "View vehicle" button; filters use two native date inputs and nine small fields in a wrap row; desktop shows the same wrap row in a blue box.

## 1. Mobile list (below `md`)
Top to bottom:
1. Eyebrow "Explore Bohol", h1 (26px), one-line subtitle ("Local owners. Go self-drive or book a local driver.").
2. **Search summary row:** a tappable field showing "Pickup to return" and `Nov 27 – Nov 29 · Panglao` (from `from`, `to`, `pickup`; show "Choose dates" when empty; format with Manila-safe date formatting, no timezone shift), and a square **Filters** button with a red count badge of active filters (type, seats, transmission, price, rating, sort ≠ recommended, dates). Tapping the summary row opens the same sheet focused on Dates.
3. **Vehicle segmented control:** All / Cars / Motorcycles with counts (existing `VehicleFilterTabs`, restyled, full width).
4. **Mode chips:** Any mode / Self-drive n / With driver n (existing `CarFilterTabs`, restyled as chips; keep the motorcycle rule: no "With driver" for motorcycles, with the existing notice).
5. Result line (`aria-live`) "Showing 8 available vehicles" (keep the existing `resultLabel` wording logic) and a **Sort** dropdown at the right (applies immediately via the same `sort` param).
6. **Vehicle cards**, one per row (new `CarTile` layout, same data):
   - Photo 16:10 with the existing carousel and its indicator; "Available" chip top-left (only when dates are set), "Motorcycle" chip top-right. **Remove the price pills from the photo.**
   - Name + year (19px), under it `type · transmission` (or `type · cc` for motorcycles), rating at the right (`RatingBadge`; show "New" when there are no reviews).
   - One spec line with icons: seats/passengers, helmets (motorcycles), transmission. Skip empty values.
   - Divider, then **"From ₱X /day"** (the lowest visible rate for the active mode, using the same price logic as `priceFor`), under it mode chips (Self-drive, With driver) for the modes the vehicle offers, and a 48px circular arrow button at the right. The whole card remains one link to the same `href`.
   - Do not show both rate amounts on the card; the detail page keeps showing them.
7. "Show more" is **optional**: only add it if the page is already paginated; otherwise keep the full list and do not invent pagination.

## 2. Mobile filters sheet
Replace the `<details>` block with a full-height bottom sheet (new client component, reusing `CarListFilters` state and the same `apply()` that calls `router.replace(carsUrl(...), { scroll: false })`). Sections: Dates (two native date pickers, return min = pickup), Vehicle type (single-choice chips; the existing `type` param holds one value, so keep single choice), Seats (− / + stepper, "Any" at 0; `seats` is a minimum), Price per day (Min/Max), Transmission (Any / Automatic / Manual, plus Semi-automatic for motorcycles), Minimum rating (Any / 4+ / 4.5+ stars: map to the existing rating values; if the existing values are 1 to 5 integers keep them), Sort by (4 choices). Type list and seat label follow `search.vehicle` exactly as today (motorcycle: Scooter, Standard, Adventure, Big bike; passengers max 2).
Sticky bottom bar: **Clear all** (secondary) and **Show N vehicles** (primary, applies and closes). N is the current result count; do not add a live count query: use the current count or the text "Show results".
Bottom bar respects `env(safe-area-inset-bottom)`.

## 3. No results and error
- No results: dashed card with a search icon, heading ("No vehicles on those dates" when dates are set and `dateNotice`; otherwise "No vehicles match your search."), one short line, primary **Change dates**, secondary **Clear filters**, text link **Try self-drive instead** (only when `dateNotice`; keep the existing links and `carsUrl` targets: the current buttons map to these). Below it an amber summary line of active filters (for example "Filters on: Sedan, Automatic, ₱800 to ₱3,000").
- Error: keep `role="alert"` and **Try again**, restyled with the same card.
- Loading (`loading.tsx`): skeleton with the new layout (segmented control, chips, 2 card skeletons on mobile; sidebar + 6 skeleton cards on desktop).

## 4. Desktop (`md`/`lg` and up)
- Navbar unchanged (it is shared; do not touch).
- Header: eyebrow, h1 (40px), intro (max 640px).
- **Search bar** card: Pickup date, Return date, Pickup place (text, existing `pickup` param), **Search** button. It updates the same params as today.
- Two columns: **left sticky filter sidebar** (272px): Vehicle type (single-choice list shown as checkbox-style rows but behaving as single select; do not show per-type counts unless the data is already loaded), Price per day (Min/Max inputs; a range slider is optional), Seats chips, Transmission, Minimum rating, header with **Clear all**. Filters apply on change (debounced) or with an **Apply filters** button at the bottom of the sidebar; pick one and keep it consistent with mobile. Right column: toolbar with vehicle chips (All / Cars / Motorcycles), mode chips (Self-drive / With driver), result count and Sort dropdown, then a **3-column grid** (2 columns at `md`) of the same new cards, equal heights (`h-full`, flex column, price block pinned to the bottom).
- Remove the old blue wrap-row filter box on desktop.

## 5. Copy
Short sentences, no paragraphs. Keep exact prices (`toLocaleString("en-PH")`), never truncate amounts or vehicle names (wrap to 2 lines).

## 6. Tests
1. At 390px: the first vehicle card is visible without scrolling past more than the header, search row, segmented control and chips; no horizontal scroll at 360px.
2. Every filter in the sheet and sidebar produces the same URL and same results as the old controls for the same inputs (compare a set of 10 URLs before and after).
3. Active-filter badge count matches the applied filters; "Clear all" resets to `/cars` while keeping `vehicle` and `mode` only if the old "Clear filters" did.
4. Motorcycle view: no "With driver" option, passenger label, helmets shown, correct type list.
5. Date search hides unavailable vehicles as before; "Available" chip shows only when dates are set.
6. Cards: "From" price equals the old lowest price for the active mode; whole card links to the same URL with the same params; keyboard focus ring visible.
7. No results and error states render; links work.
8. Desktop at 1280 and 1440: sidebar sticky, 3-column grid, equal card heights; at 768 (tablet) 2 columns and no overlap.
9. Lighthouse mobile: no layout shift from the new card photo (keep `aspect-ratio`), LCP image still prioritized as today.
10. `npm run lint`, `npx tsc --noEmit`, `npm run build`.

## Out of scope
New filters, pagination, map view, favourites, search suggestions, the car detail page, navbar/footer, backend or database changes.

## Codex prompt
*"Read `kuyog-bohol-cars-page-ui.md`. First report how `/cars`, its filter components and `CarTile` work today and where `CarTile` is used. Then implement the refined public Cars page for mobile and desktop exactly as described: new mobile header, search summary row, segmented control, mode chips, sort, the new vehicle card, the filters bottom sheet, the desktop search bar with sticky sidebar and 3-column grid, plus the no-results, error and loading states. Keep every URL param, query, filter and sort rule unchanged, keep SEO text and the server-rendered grid, and do not invent new features. Run lint, typecheck and build, run the tests in section 6, and list anything you could not verify."*
