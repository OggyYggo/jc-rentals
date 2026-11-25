# Kuyog Bohol — Testing Fixes Round 2 (Instructions for Codex)

From Jabez's test notes (Nov 24 evening):
1. The vehicle calendar does not disable or mark dates that are already booked or reserved.
2. Password creation must be strict.
3. Car photo upload must allow a maximum of 3 photos.

Reviewed against commit `529c5aa` (Nov 25). Paths below were verified in that commit; re-check them before editing.

> Next.js 16 here has breaking changes. Read the relevant guide in `node_modules/next/dist/docs/` before changing routes or server actions.

**Rules:** keep desktop layouts unchanged unless a step says otherwise; reuse existing components (`SubmitButton`, `runWithAlerts`, shadcn `Calendar`); every button that saves shows a spinner and is disabled while working; friendly error messages only (no raw database text). Migrations must be safe to run twice.

---

## 1. Vehicle calendar must show booked and reserved dates

### 1.1 What the code does today (verified)

- The public car page `app/cars/[id]/page.tsx` loads `public_car_blocked_dates` and `public_car_booking_dates` for the next 120 days, builds a list of unavailable ISO dates, and passes it to `components/customer/availability-calendar.tsx`.
- That component is a **view-only** single-select `Calendar` with `disabled` days and the note "Unavailable dates are disabled." It does not show **why** a day is unavailable (booked, held for payment, blocked by the owner, past).
- The date pickers that customers actually use to choose dates are **native `<input type="date">` fields** with only `min={today}`: `components/booking/DateUpdateForm.tsx` (car page) and `components/customer/search-form.tsx`. Native date inputs cannot grey out unavailable dates, so a customer can pick booked dates and only learns later (the database rejects the overlap).
- The data fetch on the car page is wrapped in `try { ... } catch {}`. The Supabase client **returns `{ error }` instead of throwing**, so a failed query is ignored and the calendar then shows **every date as available**.
- The view `public_car_booking_dates` (latest definition in `202611210004_qr_payment_hardening.sql`) includes `confirmed`, `picked_up`, `awaiting_payment` while the payment hold is active, and `payment_review` while the review is active. This matches the `no_double_booking` exclusion constraint, so the rule itself is consistent.

I could not run the app, so the exact cause on Jabez's phone is unconfirmed. Do the checks in 1.2 first and report the result.

### 1.2 Reproduce and diagnose first (report before coding)

1. Create or pick a booking with status `confirmed` for a car, with dates in the next 30 days.
2. In the SQL editor run: `select * from public.public_car_booking_dates where car_id = '<car id>';` — the booking must appear. If it does not, the cause is in the view or in the car's `is_active` flag.
3. As an anonymous user (no login), load `/cars/<id>`. Check whether those dates are disabled in the Availability calendar. If they are not, log the `error` values of both queries (the car page currently hides them).
4. Check the viewer's timezone: build the list of dates on the server and compare it with local dates in the browser (`isoDate()` uses `toISOString()`, the component rebuilds with local `new Date("YYYY-MM-DDT00:00:00")`). Make sure a booking from Nov 28 to Nov 30 disables exactly Nov 28, 29, 30 for a viewer in Asia/Manila.
5. Check whether the shadcn `disabled` day style is visible enough: open `components/ui/calendar.tsx` and confirm disabled days are visibly different (not just faint).

### 1.3 Fixes

**A. Stop hiding errors.** In `app/cars/[id]/page.tsx` read `error` from both queries. If either fails, log it server-side (no personal data) and pass `availabilityError = true` to the page. The page shows "We could not load availability. Please refresh." instead of an all-available calendar, and **disables the Request button** until availability loads.

**B. Pass typed periods, not a flat list.** Build `periods: { start: string; end: string; kind: "booked" | "held" | "blocked" }[]` on the server:
- `booked` = bookings with status `confirmed` or `picked_up`.
- `held` = `awaiting_payment` / `payment_review` (the date is reserved while someone is paying; it frees up automatically if the hold expires).
- `blocked` = owner-blocked dates (do not show the owner's reason to customers).
Extend `public_car_booking_dates` with a `status` column to return `kind` safely: add a new migration that recreates the view (`security_barrier`, same filters) with `case when b.status in ('confirmed','picked_up') then 'booked' else 'held' end as kind`. Do not expose the booking id, customer or any private data. Keep the existing grants.

**C. Redesign `AvailabilityCalendar`.** Keep it client-side, mobile-first, using the existing `Calendar` component with `modifiers`:
- Past days: disabled, light grey.
- `booked`: disabled, solid light-blue background, label in the legend "Booked".
- `held`: disabled, amber/striped background, legend "Reserved (awaiting payment)".
- `blocked`: disabled, grey with a small cross, legend "Not available".
- Free days: normal.
- A legend under the calendar with the four states; change the sentence to "Booked and reserved dates cannot be selected."
- Show two months on desktop and one on mobile; allow selecting a **range** (pickup and return) where the range cannot include any disabled day (use `react-day-picker` range mode with `disabled` and a `min`/`excludeDisabled` approach).
- Selecting a valid range fills the pickup and return dates of the booking form (see D) and scrolls the booking summary into view without jumping to the top (reuse the existing `scroll: false` behavior from `DateUpdateForm`).

**D. Make the booking date picker aware of availability.** Replace the two native date inputs in `DateUpdateForm.tsx` with a single date-range picker (popover with the same range calendar, the same `periods`), keeping the hidden fields `from` and `to` so the existing flow and URL still work. Keep native inputs as a fallback only if the calendar fails to load. In `components/customer/search-form.tsx`, leave the search form as it is (the `/cars` list already filters out unavailable cars for the chosen dates).

**E. Validate on the server and show a clear message.** Before the booking summary and the **Request this car** button, run a server check that the chosen range has no overlap with `booked`, `held` or `blocked` periods (use the same view). If it overlaps, show "These dates are not available for this vehicle" with the next free date range if you can compute it cheaply, and disable the button. The database exclusion constraint remains the final protection; map its error to the same friendly message ("Someone just booked these dates. Please choose other dates.").

**F. Owner calendar.** `components/owner/calendar-manager.tsx` already shows bookings and manual blocks, but the legend has only "Booking / Unavailable / Today" and `pending` is the only special status color. Add distinct colors and legend entries for: Confirmed, Awaiting payment/review (reserved), Picked up, Blocked. Do not change the layout.

**G. Dates are inclusive on both ends** in the database (`daterange(start,end,'[]')`). Keep the calendar consistent with that: the return day is unavailable to others. If Jabez later wants same-day turnover, that needs a separate decision and a database change; do not change it now.

### 1.4 Tests
1. A `confirmed` booking from Nov 28 to Nov 30 shows Nov 28, 29, 30 as "Booked" and unselectable, for an anonymous visitor and for a logged-in customer, on desktop and on a phone in Asia/Manila time.
2. A booking in `awaiting_payment` shows as "Reserved". When it expires (`expire_unpaid_bookings`), the dates become free without a reload problem (refresh shows them free).
3. Owner-blocked dates show as "Not available" with no reason text for customers.
4. A range that includes a booked day cannot be selected; the form never sends overlapping dates.
5. If the availability queries fail, the page shows the error state and the request button is disabled (simulate by temporarily breaking the view name locally).
6. Two customers choose the same free dates and submit at the same time: one succeeds, the other sees the friendly "dates just taken" message.
7. The `/cars` search still hides cars that are unavailable for the chosen dates.
8. `npm run lint`, `npx tsc --noEmit`, `npm run build`.

---

## 2. Strict password rules

### 2.1 What the code does today (verified)
- Sign-up (`components/customer/auth-form.tsx`): only `minLength={8}` on the input. Nothing else is checked.
- Password reset and owner welcome (`components/auth/password-update-form.tsx`): only `password.length < 8`.
- These are **browser-only checks**. Anyone can call Supabase Auth directly with the public key and create an account with a weak password, so the real rule must be set in Supabase too.

### 2.2 Rules (use one shared definition for every form)
Create `lib/auth/password-policy.ts` exporting `validatePassword(password, { email, fullName })` that returns a list of failed rules. Rules:
1. At least **10 characters** (maximum 72, the safe limit for most hashing).
2. At least one **uppercase** letter, one **lowercase** letter, one **number** and one **symbol**.
3. No spaces at the start or end.
4. Must **not contain the email name** (the part before `@`) or the person's name (if 3 or more characters).
5. Must **not be a common password** (include a list of the 100 most common passwords and simple patterns like `Password123!`, `Kuyogbohol123!`, `Qwerty123!`, repeated characters and sequences such as `12345`/`abcde`).
Make the minimum length a constant so it can be changed in one place.

### 2.3 Where to apply it
- Sign-up form, password reset page (`/auth/reset-password`) and owner welcome / invite page (all use `components/customer/auth-form.tsx` or `components/auth/password-update-form.tsx`).
- Create a shared `PasswordField` component (show/hide button, **live checklist** with a check or cross per rule, a strength bar, `autocomplete="new-password"`, and a confirm field on sign-up) and use it in every place. The submit button stays disabled until all rules pass and the passwords match. Messages are friendly and say exactly what is missing ("Add a symbol such as ! or @").
- Do not show the checklist on the login form (login must accept existing passwords). Existing users with old weak passwords can still log in; show a one-time gentle banner suggesting they change it from Profile (optional).

### 2.4 Enforce in Supabase (manual step; list it in your report)
In the Supabase dashboard go to Authentication → Sign In / Providers (or Policies) → Password and set: minimum length 10, required characters (lowercase, uppercase, digits, symbols). If the project's plan supports it, turn on **leaked password protection** (checks against known breached passwords). Confirm secure password change is on (re-authentication to change a password). If Codex has Supabase CLI access, also set these in `supabase/config.toml` (`[auth]` `minimum_password_length = 10` and `password_requirements = "lower_upper_letters_digits_symbols"`), otherwise leave the config unchanged and list it as a manual step.

### 2.5 Tests
1. `Abcdef1!` (too short), `abcdefghij1!` (no uppercase), `ABCDEFGHIJ1!` (no lowercase), `Abcdefghij!!` (no number), `Abcdefghij12` (no symbol) are all rejected with a clear message.
2. `Password123!` and a password containing the user's email name are rejected.
3. `Mango-Tricycle-48!` passes.
4. The checklist updates as the user types and the submit button enables only when all rules pass.
5. The reset and owner-welcome pages enforce the same rules.
6. A direct API sign-up with a weak password (use the Supabase client in a script) is **rejected by Supabase** once the dashboard settings in 2.4 are applied.
7. Existing users can still log in with their current password.
8. `npm run lint`, `npx tsc --noEmit`, `npm run build`.

---

## 3. Maximum of 3 photos per car

### 3.1 What the code does today (verified)
- `app/api/owner/car-photos/route.ts` accepts one file at a time (JPG, PNG, WebP up to 10 MB, re-encoded to WebP) and inserts a `car_photos` row. **There is no limit on the number of photos.**
- `components/owner/car-manager.tsx` lets the owner pick several files (`photos` state) and uploads them one after another.
- Owners also have direct insert rights on `car_photos` through row-level security, so a limit in the route alone can be bypassed.

### 3.2 Rules
- Maximum **3 photos per vehicle**, counting photos already saved plus new ones.
- Existing vehicles that already have more than 3 photos keep them (do not delete anything automatically). They cannot add more until they are at 2 or fewer; show "This vehicle already has more than 3 photos. Remove some to add new ones."

### 3.3 Implementation
**A. Database (new migration, safe to run twice).** Add a trigger `enforce_car_photo_limit` on `public.car_photos` before insert:
- Lock the car row (`select id from public.cars where id = new.car_id for update`) to avoid two simultaneous uploads exceeding the limit.
- Count the existing photos for the car; if the count is already 3 or more, raise `exception 'CAR_PHOTO_LIMIT'`.
- Use `security definer` only if needed; if used, `set search_path = ''` and keep the function private (revoke from public, anon, authenticated).
- Put the limit in one place: a constant in the function, and mirror it in `lib/cars/photo-limit.ts` as `MAX_CAR_PHOTOS = 3`.

**B. Upload route.** In `app/api/owner/car-photos/route.ts`, **before processing the image**, count the car's existing `car_photos`; if the count is 3 or more, return `409` with `{ error: "You can upload up to 3 photos per vehicle. Remove a photo to add another.", code: "CAR_PHOTO_LIMIT" }` without uploading anything. Also map the database error `CAR_PHOTO_LIMIT` to the same response (and remove the already uploaded files, as the route already does for row errors).

**C. Owner form.** In `components/owner/car-manager.tsx`:
- Show "Photos: n of 3 used" and keep the file picker disabled when 3 are used.
- When selecting files, only accept up to the remaining slots; if the owner picks more, keep the first allowed ones and show "Only 3 photos are allowed. We kept the first {n}."
- Show previews of the selected files with a remove button before saving.
- Upload sequentially (as now); if one upload fails, report which one failed and what was saved.
- Update helper text near the picker: "Up to 3 photos, JPG, PNG or WebP, 10 MB each. The first photo is the cover."
- Let the owner choose the cover photo (the first in `sort_order`) by moving a photo to the first position; if this already exists, keep it.

**D. Other places.** Check `components/owner/fleet-list.tsx`, owner application photo uploads (`app/apply`), and any admin car forms. If they accept car photos, apply the same maximum (the application flow can keep its own limit if it has one; report what you find).

### 3.4 Tests
1. A car with 0 photos accepts three uploads; the fourth is refused with the friendly message and nothing is stored in the bucket.
2. Selecting 5 files at once in the form keeps 3 and tells the owner.
3. Two uploads sent at the same time for a car with 2 photos: exactly one succeeds.
4. A direct insert into `car_photos` from the browser client (as an owner) with a 4th row fails with `CAR_PHOTO_LIMIT`.
5. A car that already has 5 photos: existing photos stay, uploading is blocked, removing down to 2 lets the owner add one more.
6. An owner cannot add photos to another owner's car (existing protection still works).
7. `npm run lint`, `npx tsc --noEmit`, `npm run build`.

---

## Build order
1. Section 3 (photos) and Section 2.2 and 2.3 (password UI): small and independent.
2. Section 1.2 diagnosis, then 1.3 A, B, C, D, E, F.
3. Manual dashboard steps from Section 2.4.

## Out of scope
Same-day turnover rules, photo editing or cropping, changes to payments, bookings or any desktop layout beyond what is stated.

## Codex prompt

*"Read `kuyog-bohol-testing-fixes-round2.md`. First run the diagnosis in section 1.2 and report what you found about the vehicle calendar (do not skip it). Then implement: (1) the typed availability periods, the redesigned calendar with booked, reserved and blocked states, the range picker in the booking form, the visible error state, and the owner calendar legend; (2) the shared password policy, the PasswordField with live checklist on sign-up, reset and owner welcome, and list the Supabase dashboard settings I must change; (3) the 3-photo limit in the database trigger, the upload route, and the owner form. Keep desktop layouts unchanged, use friendly errors and loading states, and make migrations safe to rerun. Run lint, typecheck and build, run the tests in each section, and list anything you could not verify."*
