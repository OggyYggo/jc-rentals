# Kuyog Bohol — Add Motorcycles (Implementation Spec for Codex)

**Repo:** `OggyYggo/jc-rentals` (Next.js 16 App Router, React 19, TypeScript, Tailwind 4, shadcn/ui, Supabase, Vercel).
**Goal:** owners can list motorcycles and scooters next to cars. Customers can search and book them. Everything else (bookings, QR payments, commission, plans, notifications) works the same.
**Related specs:** `kuyog-bohol-find-a-car-flow.md`, `kuyog-bohol-owner-application.md`, `kuyog-bohol-apply-page-implementation.md`, `kuyog-bohol-apply-plan-step.md`, `kuyog-bohol-pricing-and-plans.md`, `kuyog-bohol-security-audit-verified.md`.

**Recommendation:** build this **after** the car flow, plans and contact pages work. It is a second release, not a blocker. If Codex is already building the plans spec, apply section 8 first.

---

## 0. What exists today (do not break it)

- Table `public.cars`: `brand, model, year, car_type (free text), image_url, is_active, plate_number, transmission, fuel_type, seats, description, allows_self_drive, allows_with_driver, short_code, owner_id`.
- `public.car_rates (car_id, mode, daily_rate, included_hours, overtime_per_hour, deposit_amount, notes, license_required)`, unique per `(car_id, mode)`. `mode` is the enum `rental_mode ('self_drive','with_driver')`.
- Customers: `profiles.license_path`, `id_path`, `verification` (`none, pending, approved, rejected`). Customers can only write `full_name, phone, license_path, id_path`. A trigger resets `verification` to pending when a document changes. Admin uses `admin_set_customer_verification(uuid, verification_status)`. Booking insert requires an approved customer.
- `/cars` already uses the URL param **`type`** for the **body type** (`car_type`). **Do not reuse it.** The new vehicle filter is **`vehicle`**.
- Car page route is `/cars/[id]`. Promo kit templates read `seats`, `transmission`, `car_type`.
- Security rules from the audit apply to everything new: RLS on, explicit grants, `security definer` functions with `set search_path = public`, no EXECUTE for `public/anon`, server-side validation.

## 1. Decisions (v1)

| Topic | Decision |
|---|---|
| Table name | Keep `cars`. Do not rename. In the UI and copy say **vehicles** where both types are meant |
| Type | New column `vehicle_type` (`car` or `motorcycle`), default `car` |
| Seats | Reuse `seats` column. For motorcycles it means **passengers** (1 or 2). UI label changes |
| With driver | **Not offered for motorcycles in v1.** Motorcycles are self-drive only (DB constraint) |
| Pricing | Daily rate only (same as cars). Hourly or half-day is future work |
| Deposit | Same `car_rates.deposit_amount` (owner sets the amount; motorcycles usually lower) |
| License | Customers must have a **verified license class** that covers the vehicle type (section 4) |
| Helmets | `helmets_included` (0 to 2) shown on the card, page and promo kit |
| Plans | Plan limits count **active vehicles** (cars and motorcycles together) |
| Route | Keep `/cars`, `/cars/[id]`. Filter with `?vehicle=motorcycle`. Brand/SEO copy says "car and motorcycle rental" |

## 2. Database (migration `202611190003_vehicle_types.sql`)

```sql
create type public.vehicle_type as enum ('car', 'motorcycle');

alter table public.cars
  add column vehicle_type public.vehicle_type not null default 'car',
  add column engine_cc int check (engine_cc is null or engine_cc between 50 and 2000),
  add column helmets_included int not null default 0 check (helmets_included between 0 and 2);

alter table public.cars add constraint cars_motorcycle_rules check (
  vehicle_type = 'car'
  or (seats between 1 and 2 and allows_with_driver = false and allows_self_drive = true)
);

create index cars_vehicle_type_idx on public.cars (vehicle_type) where is_active;
```

Rules:
- `engine_cc` and `helmets_included` are optional extras; `engine_cc` is only meaningful for motorcycles (also allow null for cars). Add a check or a UI rule so cars keep `helmets_included = 0`.
- `transmission` values: keep existing for cars; for motorcycles allow `automatic`, `manual`, `semi-automatic` (validate in zod, and in a DB check if `transmission` already has a check constraint).
- `car_type` stays free text but the UI offers **different lists per type**. Cars: existing list. Motorcycles: `Scooter`, `Standard`, `Adventure`, `Big bike`.
- Owners insert and update cars directly from the browser. Check the **column grants and RLS** for `cars` and **add the three new columns** to the owner insert/update grants. Customers and anonymous users get read access only (as `cars` does today).
- Backfill: nothing needed (default `car`).
- Plans (if already built): the limit trigger counts `is_active` rows regardless of `vehicle_type`. No change to the trigger.

## 3. Owner application and owner vehicle forms

### 3.1 `/apply`
- Add a first choice in the "Your car" section, renamed **Your vehicle**: segmented control **Car | Motorcycle** (default Car). It writes `vehicle_type`.
- Fields change by type:
  - **Car** (as today): Make, Model, Year, Plate number, Seats, Transmission (Manual/Automatic), Fuel type, car type.
  - **Motorcycle:** Make, Model, Year, Plate number, **Passengers** (1 or 2), **Transmission** (Automatic, Manual, Semi-automatic), **Engine size (cc)** (optional), **Helmets included** (0, 1, 2), type (Scooter, Standard, Adventure, Big bike). Fuel type stays (Gasoline, Electric).
- "How you rent it": for motorcycles show **Self-drive only** (hide the With driver card).
- Photos and documents: same list. Photo hint for motorcycles: *Front, side, back, and the odometer.*
- Server: add `vehicle_type`, `engine_cc`, `helmets_included` to the zod schema; reject a motorcycle with `allows_with_driver`, seats outside 1–2, `engine_cc` outside 50–2000, `helmets_included` outside 0–2. Store them on `owner_applications` (new columns, same checks, defaults `car`/null/0).
- `app/admin/owner-applications/actions.ts` (approval) must copy `vehicle_type`, `engine_cc`, `helmets_included` into the draft `cars` row.

### 3.2 `/owner/cars` (rename the page title to **My vehicles**; keep the route)
- Add form uses the same type switch and fields. Type cannot be changed after bookings exist (disable the control and explain why).
- List shows a type badge (**Car** / **Motorcycle**) and a filter.
- Plans: header shows `Active vehicles 3 of 3` (see section 8).

## 4. License rules (customer side)

Motorcycles need a license that allows them. Do not guess this from the photo in code; an admin confirms it.

### 4.1 Database
```sql
alter table public.profiles
  add column license_declared_classes text[] not null default '{}'
    check (license_declared_classes <@ array['car','motorcycle']),
  add column license_classes text[] not null default '{}'
    check (license_classes <@ array['car','motorcycle']);
```
- `license_declared_classes`: **customer-writable** (add to the column grant). What the customer says their license covers.
- `license_classes`: **admin-only**. What the admin confirmed. No grant to `authenticated` for writes.
- Backfill: set `license_classes = array['car']` for customers whose `verification = 'approved'` (they were verified before motorcycles existed). Admins can add `motorcycle` later.
- Extend the existing document trigger: when `license_path` changes, also reset `license_classes` to `{}` (verification goes back to pending, as today). The admin confirms again on review.
- New admin function `admin_set_customer_license_classes(p_customer uuid, p_classes text[])` (definer, `search_path = public`, checks `is_admin()`, validates classes). Revoke from `public, anon`; grant to `authenticated`. Keep `admin_set_customer_verification` unchanged.

### 4.2 Booking enforcement
Add a **before insert trigger on `public.bookings`** (`enforce_license_class_for_booking`, definer, `search_path = public`, no client grants):
- Look up the car's `vehicle_type` and the booking `mode`.
- If `mode = 'self_drive'`: the customer's `license_classes` must contain `vehicle_type` (`car` or `motorcycle`). Otherwise `raise exception 'LICENSE_CLASS_REQUIRED'` with `detail = vehicle_type`.
- With-driver bookings (cars only) are unchanged.
- This runs for every insert path, so it cannot be bypassed from the browser.

### 4.3 Customer UI
- **Documents page** (`/account/documents`): after the license upload, a checklist **My license covers: Car, Motorcycle** (writes `license_declared_classes`). Helper text: *We confirm this when we review your license. Please upload a clear photo of the front and back.* Show a note about the current Philippine rules: *Motorcycles need a license valid for motorcycles.* (Link to the LTO page for the actual restriction codes; **do not hard-code restriction codes** in the app; the admin decides.)
- **Car page booking card:** for a motorcycle, if the customer is signed in but `license_classes` does not include `motorcycle`, disable **Book now** and show: *"Your license is not yet verified for motorcycles. Update your documents and we will review it."* with a button to `/account/documents`. Signed-out: the normal sign-in prompt.
- Map the database error `LICENSE_CLASS_REQUIRED` to that same friendly message (409 from API routes; no raw SQL text).
- **Admin `/admin/customers`:** show declared vs confirmed classes; checkboxes to confirm; saving calls `admin_set_customer_license_classes`. Approving verification without confirming a class is allowed (class stays empty and booking is blocked, with the message above). Show a warning in the review drawer if the customer declared motorcycle and the admin did not confirm it.
- Notify the customer when classes are confirmed (`license_classes_updated`, in-app and email) using the existing `notify` pattern.

## 5. Search and listing

- URL param **`vehicle`**: `car`, `motorcycle`, none (all). Add it to `lib/cars/searchParams.ts` zod schema: `vehicle: z.enum(["car","motorcycle"]).optional().catch(undefined)`; include in `carsUrl()`. Keep `type` (body type) as is.
- `/cars`: a **segmented tab** above the filters: **All | Cars | Motorcycles** with counts (counts follow the other active filters). Under it keep Self-drive / With driver tabs: when `vehicle=motorcycle`, **hide With driver** (and ignore `mode=driver`, showing self-drive instead with a small notice).
- Filters per type: Seats becomes **Passengers** for motorcycles (1 or 2); body type options change to the motorcycle list; add **Engine size** (optional range) later, not in v1.
- Query: `vehicle` becomes an `.eq("vehicle_type", vehicle)` filter in the server component, same place as the other filters. Availability, price sort and owner/plan visibility rules do not change.
- Landing page: the search card gets **Car | Motorcycle** as the first toggle (default Car) and builds `/cars?vehicle=…&mode=…&from=…&to=…`. With **Motorcycle** selected, the With driver option is hidden. The featured vehicles section may show a mix; add a small badge on motorcycle cards.
- Empty states: *"No motorcycles match your search."* with **Clear filters** and **See all vehicles**.

## 6. Vehicle card and page

- **Card:** type badge (hidden for cars if all are cars to avoid clutter; always show **Motorcycle**), specs line: car `5 seats · Automatic · SUV`; motorcycle `2 passengers · Automatic · 125 cc · Helmet included`. Price: `From ₱X / day`.
- **Page `/cars/[id]`:** specs row uses a bike icon for motorcycles (lucide `Bike`), label *Passengers*, *Engine size*, *Helmets included: 2*. Booking card hides With driver for motorcycles. Add a short **Before you ride** note: valid license, helmet required, owner's damage and fuel rules (from `car_rates.notes`).
- **OG image** (`opengraph-image.tsx`): use the same specs logic.
- **Promo kit** (`lib/promo/*`): the templates' specs line and copy use the vehicle-type-aware text (*Rent this motorcycle in Bohol*). The QR and short links are unchanged.
- **Owner and admin tables:** show type badge and filter.
- Accessibility: badge text is real text (not color only); icons are decorative (`aria-hidden`) except where they carry meaning.

## 7. Copy, SEO and legal

- Keep the brand **Kuyog Bohol**. Update copy where it says only "car": navbar item **Cars** → **Vehicles** (route `/cars` stays), page titles (*Rent a car or motorcycle in Bohol | Kuyog Bohol*), meta descriptions, footer text, For owners page (*List your car or motorcycle*), Apply page header (*Apply to list your vehicle*). The landing hero headline is a **business decision**: default *"Rent a car or motorcycle in Bohol"*; flag it in the PR for the owner to confirm.
- **Terms** (`/terms`): add a **Motorcycle rentals** section: valid license for motorcycles required, helmet required for rider and passenger, maximum 2 persons, no off-road or racing, customer pays fuel and traffic fines, damage and theft are handled under the owner's stated policy and deposit, Kuyog Bohol is a booking platform and does not provide insurance. Mark it **for legal review** in a code comment; do not claim insurance coverage anywhere.
- Update the FAQ and the pricing page wording from "cars" to "vehicles" (see section 8).

## 8. Changes to the other specs

- **Plans spec (`kuyog-bohol-pricing-and-plans.md`):** use **`max_active_vehicles`** instead of `max_active_cars` in `plans` and in the limit trigger and functions (if the plans migration was already applied, add a rename migration). Seed text: *Up to 3 active vehicles*, etc. All UI copy and notifications say "vehicles". Error code `CAR_LIMIT_REACHED` may stay or become `VEHICLE_LIMIT_REACHED`; pick one and use it everywhere.
- **Apply plan step:** chips say *up to 3 vehicles*.
- **Find-a-car spec:** add the `vehicle` param to the URL rules table and the empty states.
- **Owner application spec:** add the vehicle type choice and motorcycle fields.

## 9. Security

- Validate `vehicle`, `vehicle_type`, `engine_cc`, `helmets_included` on the server (zod) and in the database (checks). The browser cannot choose a license class or bypass the booking trigger.
- `profiles.license_classes` has no write grant for customers; only `admin_set_customer_license_classes` writes it.
- New functions: `security definer`, `set search_path = public`, EXECUTE revoked from `public, anon, authenticated` except the admin function (granted to `authenticated`, `is_admin()` check inside). Trigger functions get no client grants.
- Error messages shown to users never include SQL text.
- Uploaded photos and documents follow the existing bucket rules (type and size limits, private documents).

## 10. Files

```
supabase/migrations/202611190003_vehicle_types.sql
lib/cars/searchParams.ts        // add vehicle param
lib/apply/schema.ts             // vehicle fields and rules
lib/vehicles/options.ts         // body types, transmissions, labels per type (new)
app/apply/*                     // type switch, fields
app/cars/page.tsx               // vehicle filter, tabs, hide With driver for motorcycles
app/cars/[id]/page.tsx          // specs, booking card, license message
app/cars/[id]/opengraph-image.tsx
app/page.tsx + components/home/SearchCard   // Car | Motorcycle toggle
app/owner/cars/*                // My vehicles
app/admin/customers/*           // license class confirmation
app/admin/owner-applications/*  // copy vehicle fields on approval
app/account/documents/*         // declared classes
app/terms/page.tsx              // motorcycle section
lib/promo/*                     // copy and specs
```

## 11. Test plan

SQL (with `set local role authenticated` and JWT claims):
1. Owner inserts a motorcycle with `seats = 3` → rejected; with `allows_with_driver = true` → rejected; valid motorcycle → accepted.
2. Customer with `license_classes = {car}` books a motorcycle (self-drive) → `LICENSE_CLASS_REQUIRED`; after admin adds `motorcycle` → succeeds.
3. Customer tries `update profiles set license_classes = '{motorcycle}'` → permission denied.
4. Customer changes `license_path` → verification pending and `license_classes` reset.
5. Customer books a car with `{car}` → succeeds (no regression); with-driver car booking is unaffected.
6. Anonymous calls `admin_set_customer_license_classes` → denied; a non-admin authenticated user → "Administrator access required."
7. Plan limit counts cars and motorcycles together (if plans exist).

App:
- `/cars?vehicle=motorcycle` shows only motorcycles, hides With driver, counts correct; `?vehicle=banana` is ignored.
- Landing search card builds the right URL.
- Apply form: switching Car/Motorcycle changes the fields and keeps typed values that still apply.
- Motorcycle page shows passengers, engine size, helmets and the license message when needed.
- Mobile 390px: no horizontal scroll; tabs wrap cleanly.
- `npm run lint`, `npx tsc --noEmit`, `npm run build`.

## 12. Acceptance checklist

- [ ] Owners can apply for and list a motorcycle with passengers, engine size and helmets.
- [ ] Motorcycles can never offer With driver (UI and database).
- [ ] `/cars` filters by vehicle type with tabs and counts; the existing `type` filter still works.
- [ ] The landing search card has Car | Motorcycle and hides With driver for motorcycles.
- [ ] A customer cannot book a motorcycle without an admin-confirmed motorcycle license class, and sees a friendly message with a link to fix it.
- [ ] Admin can confirm license classes; the customer is notified.
- [ ] Existing approved customers can still book cars (backfill).
- [ ] Plan limits count vehicles and the copy says "vehicles".
- [ ] Terms have a motorcycle section, flagged for legal review; no insurance claims anywhere.
- [ ] Promo kit and OG images show the correct vehicle text.
- [ ] No raw SQL errors reach the user; all new functions have `search_path` and no anon EXECUTE.
- [ ] Lint, typecheck and build pass; SQL tests 1–7 pass.

## 13. Codex prompt

*"Add motorcycles following `kuyog-bohol-motorcycles.md`. Read the existing `cars`, `car_rates`, `profiles` and booking policies, triggers and grants first. Build in this order: migration (section 2 and 4.1) and SQL tests, `lib/vehicles` and zod schemas, license enforcement trigger and admin function, `/apply` and owner vehicle forms, search and `/cars` filters, car page and booking card, admin customers, copy and terms, promo kit, then the plan wording changes in section 8. Do not reuse the `type` URL param; use `vehicle`. Never hard-code license restriction codes. Never print or commit secrets. Run lint, typecheck and build, then list what you could not verify."*
