# Kuyog Bohol — "Find a car" Links, Search and Filters

**Goal:** every "Find a car" button and the search card lead the customer to a car list that already matches what they asked for. No dead ends, no scrolling to the wrong place.

**Stack:** Next.js 16 (App Router), React 19, Tailwind 4, shadcn/ui, Supabase.

Related files: `kuyog-bohol-landing-page-design.md` (landing page), `kuyog-bohol-loading-indicators.md` (loading states).

---

## 1. What each button does

| Where | Label | Goes to | Notes |
|---|---|---|---|
| Hero search card | **Search cars** | `/cars?mode=…&from=…&to=…&pickup=…` | Uses the mode toggle (Self-drive / With driver), dates and pickup location the customer chose |
| "Ride with a local driver" section | **Find a car with driver** | `/cars?mode=driver` | Filtered to cars that offer a driver |
| "Ride with a local driver" section | **Prefer to drive yourself? See self-drive cars** | `/cars?mode=self` | Filtered to self-drive cars |
| "Book in three steps" band | **Find your car** | `#top`, then focus the **Pickup date** field | Scrolls to the search card and opens the date picker |
| Featured cars | **All cars / Self-drive / With driver** tabs | Same page, filter changes | Updates `?mode=` in the URL |
| Featured cars | **View all cars** | `/cars` | No filter |
| Car card | whole card | `/cars/[slug]` (keep `?mode`, `from`, `to`) | Dates and mode carry over to the car page |
| Navbar | **With a driver** | `#trips` on the home page | Scrolls to the driver section |
| Navbar | **Cars** | `/cars` | |

On the landing page, the featured cars section has the **filter tabs**. Clicking "Find a car with driver" in the driver section also switches the tabs to **With driver** (in the design this is already how it behaves).

---

## 2. URL rules (the single source of truth)

All filters live in the URL, so links can be shared and the back button works.

| Param | Values | Default | Example |
|---|---|---|---|
| `mode` | `self`, `driver` | none (show all cars) | `mode=driver` |
| `from` | `YYYY-MM-DD` | none | `from=2026-12-01` |
| `to` | `YYYY-MM-DD` | none | `to=2026-12-03` |
| `pickup` | text (area name) | none | `pickup=Tagbilaran` |
| `seats` | number (minimum seats) | none | `seats=5` |
| `sort` | `recommended`, `price_asc`, `price_desc` | `recommended` | `sort=price_asc` |

Examples:

```
/cars                                      all cars
/cars?mode=driver                          only cars that offer a driver
/cars?mode=self&from=2026-12-01&to=2026-12-03&pickup=Tagbilaran
```

Rules:

- Validate every param on the server with zod. Ignore invalid values (do not error). For example `mode=banana` becomes "no mode".
- `from` must be today or later. `to` must be after `from`. If either is wrong, drop both and show a small message: *"Please choose valid dates."*
- Always read params from `searchParams` in the **server component** so the list is rendered on the server (fast, shareable, SEO friendly).
- Change filters with `router.replace` (not `push`) so the back button does not fill with filter steps. Use `scroll: false`.

---

## 3. What the list shows for each mode

A car can offer **self-drive**, **with driver**, or **both**.

| `mode` | Cars shown | Price shown on the card |
|---|---|---|
| none | all published cars | both prices, if offered |
| `self` | cars with `offers_self_drive = true` | **Self-drive from ₱X / day** only |
| `driver` | cars with `offers_with_driver = true` | **With driver from ₱X / day** only |

Tabs show counts, for example **All cars (6)**, **Self-drive (5)**, **With driver (5)**. Counts follow the other active filters (dates, seats), not just the mode.

Under the tabs show a result line: *Showing 5 cars with a driver*, *Showing 5 self-drive cars*, or *Showing all 6 cars*.

### Dates

When `from` and `to` are present, only show cars that are **available for all those days**:

- A car is **not available** if it has any booking in `pending` or `confirmed` status that overlaps the dates, or the owner blocked those dates.
- Overlap test: `existing.start < requested.end AND existing.end > requested.start`.
- If dates are not set, show all cars and ask for dates on the car page before booking.

### Query sketch (Supabase)

```ts
// app/cars/page.tsx (server component)
const supabase = await createClient();

let q = supabase
  .from("cars")
  .select("id, slug, name, seats, transmission, photo_url, price_self_drive, price_with_driver, offers_self_drive, offers_with_driver")
  .eq("status", "published");

if (mode === "self") q = q.eq("offers_self_drive", true);
if (mode === "driver") q = q.eq("offers_with_driver", true);
if (seats) q = q.gte("seats", seats);
if (pickup) q = q.ilike("pickup_location", `%${pickup}%`);

// availability: let the database do it, don't loop in JS
if (from && to) {
  const { data: busy } = await supabase
    .from("bookings")
    .select("car_id")
    .in("status", ["pending", "confirmed"])
    .lt("start_date", to)
    .gt("end_date", from);
  const busyIds = (busy ?? []).map((b) => b.car_id);
  if (busyIds.length) q = q.not("id", "in", `(${busyIds.join(",")})`);
}

const { data: cars } = await q.order("created_at", { ascending: false });
```

For production, move the availability check into a Postgres function (`available_cars(from, to, mode)`) so it is a single fast query and stays correct. Only owners with enough **credits** and an approved account should have their cars show as bookable.

---

## 4. The search card

| Field | Behavior |
|---|---|
| Mode toggle | **Self-drive** (default) or **With driver**. Writes `mode` |
| Pickup date | Date picker. Cannot pick past dates |
| Return date | Opens after pickup is chosen. Must be after pickup |
| Pickup location | Text with suggestions (Tagbilaran, Panglao, Loboc, Carmen, Tubigon, Anda, other) |
| **Search cars** button | Builds the URL and goes to `/cars` |

Steps on click:

1. Validate. If something is missing, show an error under that field, do not navigate.
2. If only the mode was chosen, still go to `/cars?mode=…` (dates are optional).
3. Show the button spinner while navigating (see the loading indicators spec).

Remember the last search: save `mode`, `from`, `to`, `pickup` in `sessionStorage` (wrapped in try/catch) so the car page and booking form can prefill them. Never rely on it for anything important.

---

## 5. "Find your car" (Book in three steps)

1. Smooth scroll to `#top`.
2. After the scroll ends, focus the **Pickup date** input and open the picker.
3. Respect `prefers-reduced-motion` (jump instead of smooth scroll).

---

## 6. Car page and booking

- Car page URL keeps the search: `/cars/toyota-innova?mode=driver&from=2026-12-01&to=2026-12-03`.
- The booking card on the car page is prefilled from the URL. If a car offers both modes, the selected mode is highlighted. If the car offers only one, show only that one.
- If `mode=driver` but the car does not offer a driver, show *"This car is available self-drive only"* and switch the mode.
- If the dates are no longer available, show *"Sorry, those dates were just taken. Try other dates."* and keep the customer on the page.

---

## 7. Empty and edge states

| Situation | Show |
|---|---|
| No cars match | *"No cars match your search."* with buttons **Clear filters** and **See all cars** |
| No cars with a driver on those dates | *"No cars with a driver on those dates."* with **Try self-drive** and **Change dates** |
| Loading | Skeleton card grid (`loading.tsx`) and a top progress bar |
| Error | Error state with **Try again** |
| Invalid URL params | Ignore them, show the full list |

---

## 8. Components

```
components/cars/
  CarFilterTabs.tsx      // All / Self-drive / With driver, with counts (client)
  CarResultsHeader.tsx   // "Showing 5 cars with a driver"
  CarCard.tsx            // shows only the price(s) that match the mode
  CarsEmptyState.tsx
components/home/
  SearchCard.tsx         // client: builds the /cars URL
  FindCarLink.tsx        // link that sets mode, used by the driver section buttons
lib/cars/
  searchParams.ts        // zod schema + helpers: parse, build URL
```

URL helper:

```ts
// lib/cars/searchParams.ts
import { z } from "zod";

export const carSearchSchema = z.object({
  mode: z.enum(["self", "driver"]).optional().catch(undefined),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().catch(undefined),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().catch(undefined),
  pickup: z.string().max(80).optional().catch(undefined),
  seats: z.coerce.number().int().min(1).max(20).optional().catch(undefined),
  sort: z.enum(["recommended", "price_asc", "price_desc"]).optional().catch(undefined),
});

export function carsUrl(params: Partial<z.infer<typeof carSearchSchema>>) {
  const sp = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => v != null && v !== "" && sp.set(k, String(v)));
  const qs = sp.toString();
  return qs ? `/cars?${qs}` : "/cars";
}
```

Usage in the driver section: `<Link href={carsUrl({ mode: "driver" })}>Find a car with driver</Link>`.

---

## 9. Accessibility

- Filter tabs are real buttons in a `role="tablist"` group (or radio group), with `aria-selected` and a visible focus ring (`#2E9BF0`).
- The result line uses `aria-live="polite"` so screen readers hear *"Showing 5 cars with a driver"* when the filter changes.
- Links that scroll or navigate have clear text. Do not use "Click here".
- Date inputs are labeled and keyboard friendly.

---

## 10. Acceptance checklist

- [ ] "Find a car with driver" opens `/cars?mode=driver` and shows only cars that offer a driver.
- [ ] "See self-drive cars" opens `/cars?mode=self`.
- [ ] The search card builds the URL from mode, dates and pickup, and invalid input shows errors without navigating.
- [ ] "Find your car" scrolls to the search card and focuses the Pickup date.
- [ ] The tabs update the URL, the list and the counts, and the back button works.
- [ ] A car card shows only the price that matches the active mode.
- [ ] Cars that are booked on the chosen dates do not appear.
- [ ] Mode and dates carry over to the car page and the booking form.
- [ ] Empty, loading and error states exist for the list.
- [ ] Bad URL params never crash the page.
- [ ] Filtered pages can be shared and reopened with the same result.
