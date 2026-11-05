# Kuyog Bohol: Customer Home Page and Owners Page (Implementation Brief)

**Read this first (rule for whoever implements it):** follow the **present design** of the site. Do not introduce a new palette, new fonts, or a new visual style. Before writing any code, open the existing landing page, `app/globals.css`, the shadcn components in `components/ui/`, and the current header and footer. Reuse their colors, fonts, radius, spacing, shadows, icon style, button styles, dark mode behavior, and section rhythm. New pages must look like they were built together with the current landing page.

Bohol identity comes from **content and photography** (real places, real cars, local wording), not from changing the theme. Ignore the green/brown/teal palette in `design-system-bohol.md`; it is replaced by this rule.

---

## 1. Problem

The current `/` is a landing page for **car owners** (rental management software). The business is a **public booking platform for customers**. A customer opening the site today cannot search for a car, see prices, or book.

## 2. Goal

| Route | Audience | Purpose |
|---|---|---|
| `/` | Customers (tourists and locals) | Search and book a car in Bohol |
| `/for-owners` | Car owners | Explain the platform and recruit owners (the **current landing page moves here**) |

A customer must never need to see `/for-owners`. Owners reach it through a small "List your car" link in the header and footer.

---

## 3. Header and Footer Changes

Keep the existing header and footer components and styling. Change only the content.

**Header (left to right)**
- Logo: Kuyog Bohol
- Links: **Cars**, **Popular trips**, **How it works**, **List your car** (to `/for-owners`), **Contact**
- Right side: **My bookings**, **Log in**, **Sign up** (rename "Get started" to "Sign up")
- Mobile: same links inside the existing mobile menu or sheet

**Footer**
- Links: Cars, How it works, List your car, Contact, Terms, Privacy
- Short line: "Car rental in Bohol. Self-drive or with a local driver."

---

## 4. New Home Page (`/`)

Build these sections in order, using the existing section layout, container width, spacing, and card styles.

### 4.1 Hero
- **Headline:** Explore Bohol your way.
- **Subheadline:** Drive yourself or ride with a local driver. Book in minutes.
- **Background image:** a real photo of a car at a Bohol location (Chocolate Hills viewpoint, Loboc, Panglao). Use `next/image`, WebP, and `priority`. If there is no photo yet, use the existing hero background style with no image.
- **Search card** (overlapping the bottom of the hero on mobile):
  - Pickup date and return date (existing shadcn date picker or `Calendar` in a `Popover`)
  - Mode toggle: **Self-drive | With driver** (segmented control built from existing button or tabs styling)
  - Primary button: **Find cars**
  - Submits to `/cars?start=YYYY-MM-DD&end=YYYY-MM-DD&mode=self_drive|with_driver`
  - Validate: return date is not before pickup date, and pickup date is not in the past

### 4.2 Trust strip
Small row of 3 or 4 items with icons, styled like the existing feature chips:
- Verified local owners
- Clear prices, no hidden fees
- Small deposit to book
- Documents kept private

### 4.3 Popular trips (with driver)
Cards that link to `/cars?mode=with_driver` with a note about the trip:
- Countryside day tour (Chocolate Hills, Loboc River, Bilar forest, tarsiers)
- Panglao and Alona beach day
- Island hopping and dolphin watching transfer
- Airport or hotel transfer

Each card has a title, one line of description, and "Find a car with driver". Use real photos when available, otherwise the existing card style with an icon. Do not show prices on these cards unless they come from real data.

### 4.4 Featured cars
- Grid of up to 6 active cars from the database (newest or manually featured first).
- Card content: photo (WebP, 4:3), name, seats, transmission, and "Self-drive from ₱X / day" and/or "With driver from ₱Y / day" (only the modes enabled for that car).
- Link to `/cars/[id]`.
- **Empty state (no cars yet):** a card saying "Cars are being added. Check back soon," with a "List your car" link. **Never show fake cars or fake prices.**

### 4.5 How it works (3 steps)
Reuse the existing numbered "How it works" component (01, 02, 03):
1. **Choose your car:** pick dates, Self-drive or With driver, and a car.
2. **Pay a small deposit:** scan the QR and upload your proof of payment.
3. **Pick up and go:** meet the owner or driver, pay the balance, and enjoy Bohol.

### 4.6 Why book with Kuyog Bohol
Four short cards (reuse the existing feature card style):
- **Local owners:** cars come from owners based in Bohol.
- **Two ways to travel:** drive yourself or ride with a driver.
- **Clear pricing:** see what is included before you book.
- **Private documents:** your license and ID are stored securely.

### 4.7 Owners band
A single full-width band using the existing call-to-action section style:
- **Text:** Own a car in Bohol? List it on Kuyog Bohol.
- **Button:** List your car (to `/for-owners`)

### 4.8 FAQ
Accordion (shadcn `Accordion`) with 5 or 6 questions:
- What do I need to rent self-drive? (valid driver's license, valid ID, deposit)
- Can I book with a driver instead? (yes, no license needed)
- How do I pay? (small deposit by QR, balance to the owner at pickup)
- What if I need to cancel? (link to cancellation policy)
- Is fuel included? (depends on the listing, shown on each car)
- Where do I pick up? (shown on the car page and confirmed after booking)

Final answers must match the real policies. Mark any unconfirmed policy with a TODO comment, not invented text.

---

## 5. New Customer Pages

Use the existing account and booking styles where they already exist.

### `/cars` (listing)
- Reads `start`, `end`, and `mode` from the URL.
- Shows only cars **available for those dates** and **enabled for that mode**.
- Filters: car type, seats, transmission, price range. On mobile, filters open in a `Sheet`.
- Same car card as the home page, plus an "Available" tag when dates are chosen.
- Empty state: "No cars free on those dates. Try different days or switch mode."

### `/cars/[id]` (detail and booking)
- Photo gallery, spec chips, tabs for Self-drive and With driver showing rate and what is included.
- Policies in an accordion (deposit, fuel, mileage, cancellation, overtime for with-driver).
- Availability calendar with blocked and booked dates disabled.
- Booking summary card (sticky on mobile): days, rate, total, **deposit due now**, balance at pickup.
- **Book** button: if logged out, send to `/login` and return to this car with the chosen dates.

Pricing must be calculated on the **server**. Never trust prices sent from the browser.

### Booking and payment
Follow `payment-qr-implementation.md` for statuses, the QR payment page, proof upload, and verification.

---

## 6. Owners Page (`/for-owners`)

Move the **current landing page** here. Keep its design exactly. Change only this content:

| Current | Change to |
|---|---|
| "Start managing for free" | **"Apply to list your car"** |
| "Free to get started · No credit card required" | **"No monthly fee. You pay 5% only when you get a booking."** |
| "Built for independent rental operators across the Philippines" | **"Built for car owners in Bohol."** |
| "Get started" / "Get started today" (sign up buttons) | Link to `/contact` or an owner application form, **not** customer sign-up |
| Sample dashboard with Juan, October 21, 2025, ₱84,250, and fake customers | Replace with a screenshot of the **real** owner dashboard, or remove the sample until real data exists |
| "Our local support team is here to help" | "Questions? Message us." with real contact details, and no claim about a team |
| Monthly revenue and utilization chart with invented numbers | Remove, or label clearly as "Example" |

**Important:** owner accounts are created by an admin (see README). The owners page must **not** send owners to the customer sign-up page, because a customer account cannot list cars. The call-to-action goes to a contact or application form. The admin then provisions the owner account.

Keep the section order, wording tone, and visuals otherwise.

---

## 7. Copy Reference

| Place | Text |
|---|---|
| Home headline | Explore Bohol your way. |
| Home subheadline | Drive yourself or ride with a local driver. Book in minutes. |
| Search button | Find cars |
| Empty cars | Cars are being added. Check back soon. |
| Owners band | Own a car in Bohol? List it on Kuyog Bohol. |
| Owners page offer | No monthly fee. You pay 5% only when you get a booking. |
| Page title (home) | Kuyog Bohol: Car Rental in Bohol, Self-Drive and With Driver |
| Meta description (home) | Rent a car in Bohol from local owners. Drive yourself or hire a car with a driver. Book online in minutes. |
| Page title (owners) | List Your Car in Bohol: Kuyog Bohol |

Do **not** show the 5% commission to customers. Do **not** claim a support team, reviews, or numbers that are not real.

---

## 8. Data and Technical Notes

- Home and listing pages are **server components** reading from Supabase. The `cars`, `car_photos`, and `car_rates` tables need public read access for **active** cars only (RLS).
- Availability uses the `bookings` table (statuses that hold dates) and `car_blocked_dates`. Reuse the query logic in `car-rental-platform.md`.
- Use `next/image` with `sizes`, lazy loading below the fold, and the Supabase host in `remotePatterns`.
- Add metadata (`generateMetadata`), an Open Graph image, and `lang="en"`.
- Keep the page fast on mobile data: hero image under about 200 KB, no autoplay video.
- Respect existing dark mode and `prefers-reduced-motion` behavior.

---

## 9. Acceptance Checklist

- [ ] Opening `/` shows the customer home page, not the owner page
- [ ] The search card works and sends dates and mode to `/cars`
- [ ] `/cars` shows only available cars for the chosen dates and mode
- [ ] `/cars/[id]` shows rates, policies, calendar, and the deposit summary
- [ ] `/for-owners` has the old landing page with the content changes in section 6
- [ ] Header and footer updated, with "List your car" linking to `/for-owners`
- [ ] No fake cars, prices, names, dates, or team claims anywhere
- [ ] Visual style matches the present design (no new colors or fonts)
- [ ] Works on a phone-sized screen and in dark mode
- [ ] Empty states work when the database has no cars

## 10. Not in This Task

- The QR payment flow and payouts (see `payment-qr-implementation.md`)
- Reviews, promo codes, and separate driver profiles (later phases)
- Changes to owner and admin dashboards

## 11. Open Questions for the Owner of the Project

- Photos: who will take real photos of the cars at Bohol places?
- Guest booking or required account for the first release?
- Contact details to show (phone, Facebook page, email)?
- Final cancellation and fuel policy text for the FAQ
