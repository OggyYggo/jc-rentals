# Kuyog Bohol: Customer Home Page and Owners Page (Implementation Brief)

**Read this first (rule for whoever implements it):** the customer-facing pages get a **warmer, photo-led Bohol look in a blue and white palette** (see section 12, "Design Direction"). The **owner and admin dashboards keep the present design** and must not change.

Before writing any code, open the existing landing page, `app/globals.css`, the shadcn components in `components/ui/`, and the current header and footer. Keep using the existing shadcn components and the same code structure. The customer pages change only through a scoped blue theme, bigger photography, and the extra elements in section 12.

The green/brown/teal palette in `design-system-bohol.md` is **not used**. Blue and white replaces it. Keep that file only for ideas about photos, copy, and the hills motif.

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

Reuse the existing header and footer components, themed with the blue and white public theme (section 12). Change the content as below.

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

Build these sections in order, using shadcn components and the public theme and layout rules in section 12.

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
- [ ] Customer pages use the blue and white theme from section 12, and look photo-led and warm
- [ ] Owner and admin dashboards look exactly the same as before
- [ ] Works on a phone-sized screen and in dark mode
- [ ] Empty states work when the database has no cars

## 10. Not in This Task

- The QR payment flow and payouts (see `payment-qr-implementation.md`)
- Reviews, promo codes, and separate driver profiles (later phases)
- Changes to owner and admin dashboards

## 12. Design Direction (customer pages only): Blue and White, Bohol Feel

**Idea:** a bright, clean blue and white interface, like the Bohol Sea and sky. The **photos** bring the warm greens and browns of the Chocolate Hills, so the page feels like Bohol without needing extra colors in the interface.

### 12.1 Scope
- Applies to: `/`, `/cars`, `/cars/[id]`, booking and payment pages, and the public header and footer.
- Does **not** apply to: `/owner`, `/admin`, and `/for-owners` (keeps the present design).
- Implementation: move the public pages into a route group such as `app/(public)/` with its own `layout.tsx` that wraps content in `<div className="theme-public">`. The theme below is scoped to that class so nothing else changes.

### 12.2 Color Palette (blue and white only)

| Role | Name | Hex | Use |
|---|---|---|---|
| Primary | **Sea Blue** | `#0B63CE` | Buttons, links, active states, price pills |
| Primary dark | **Deep Sea** | `#0A3D91` | Hover, headings on light backgrounds, owners band, footer |
| Text | **Navy** | `#0F2342` | Body text and headings |
| Accent | **Sky** | `#2E9BF0` | Focus rings, icons, highlights (not for small text on white) |
| Background | **White** | `#FFFFFF` | Page and cards |
| Soft background | **Mist** | `#EAF4FF` | Alternating sections, trust strip, filters |
| Page tint | **Foam** | `#F5FAFF` | Optional page background |
| Border | **Ripple** | `#D6E6F7` | Borders and dividers |
| Muted text | **Slate Blue** | `#51657F` | Secondary text |
| Error | **Coral Red** | `#D64545` | Errors and destructive actions only |

Rules:
- White text on Sea Blue and Deep Sea. Navy text on white and Mist.
- Alternate section backgrounds: white, Mist, white, Mist.
- No other accent colors. Red is for errors only.

**Booking status badges (still blue and white)**

| Status | Style |
|---|---|
| awaiting_payment | Mist background, Navy text, clock icon |
| payment_review | Sky background, white text |
| confirmed / completed | Sea Blue background, white text, check icon |
| picked_up / returned | Deep Sea background, white text |
| expired / cancelled / rejected | Light gray background, Coral Red text |

### 12.3 Theme Code

`app/globals.css` (scoped, so the dashboards are not affected)

```css
.theme-public {
  --background: #FFFFFF;
  --foreground: #0F2342;
  --card: #FFFFFF;
  --card-foreground: #0F2342;
  --popover: #FFFFFF;
  --popover-foreground: #0F2342;
  --primary: #0B63CE;
  --primary-foreground: #FFFFFF;
  --secondary: #EAF4FF;
  --secondary-foreground: #0A3D91;
  --muted: #EAF4FF;
  --muted-foreground: #51657F;
  --accent: #EAF4FF;
  --accent-foreground: #0A3D91;
  --destructive: #D64545;
  --border: #D6E6F7;
  --input: #D6E6F7;
  --ring: #2E9BF0;
  --radius: 1rem;

  --deep-sea: #0A3D91;
  --mist: #EAF4FF;
  --foam: #F5FAFF;
}

.dark .theme-public {
  --background: #0B1A2E;
  --foreground: #EAF4FF;
  --card: #12263F;
  --card-foreground: #EAF4FF;
  --popover: #12263F;
  --popover-foreground: #EAF4FF;
  --primary: #5AB0FF;
  --primary-foreground: #0B1A2E;
  --secondary: #1A3556;
  --secondary-foreground: #EAF4FF;
  --muted: #16304E;
  --muted-foreground: #A9BCD3;
  --accent: #1A3556;
  --accent-foreground: #EAF4FF;
  --border: #25446B;
  --input: #25446B;
  --ring: #5AB0FF;
}
```

If the project's current shadcn variables use a different color format (for example `oklch`), keep the same format and convert these values.

### 12.4 Typography
- Keep the current body font.
- Optional warm touch: use a serif such as **Fraunces** (`next/font/google`) for the hero headline and section headings on public pages only. It gives a friendly, human feel next to the blue interface.
- Hero headline: `text-4xl md:text-6xl`. Section headings: `text-3xl md:text-4xl`.

### 12.5 What Makes It Less Plain (the main changes)

1. **Full-width hero photo.** Real photo of a car at a Bohol place, with a navy-to-transparent gradient overlay (`from-[#0F2342]/70`) so the white headline is easy to read. Hero height about `min-h-[70vh]` on desktop and `min-h-[60vh]` on mobile.
2. **Floating search card.** White, `rounded-2xl`, soft blue shadow, overlapping the hero's bottom edge.
3. **Hills divider** at the bottom of the hero and above the footer, drawn in layered blues (component below).
4. **Large photo cards** for cars and trips: big 4:3 images, rounded corners, a Sea Blue price pill in the corner ("From ₱1,800 / day"), subtle hover zoom.
5. **Popular trips as photo tiles:** photo background with a navy gradient, white title, and a small "Find a car with driver" link.
6. **Alternating section colors** (white and Mist) for rhythm.
7. **Deep Sea owners band** with white text and a white button.
8. **Deep Navy footer** with the hills shape on top.
9. **Subtle motion** (GSAP, already used in your other projects): slow parallax on the hero photo, fade-and-rise on cards. Disable for `prefers-reduced-motion`. No animation on dashboards.

### 12.6 Hills Divider Component (blue layers)

```tsx
// components/brand/hills-divider.tsx
export function HillsDivider({
  className = "",
  back = "#CFE6FB",   // distant hills
  front = "#FFFFFF",  // match the next section's background
}: { className?: string; back?: string; front?: string }) {
  return (
    <svg viewBox="0 0 1440 140" preserveAspectRatio="none" className={className} aria-hidden="true">
      <path
        fill={back}
        d="M0 140 V95 Q80 25 160 95 Q250 45 340 95 Q430 15 520 95 Q610 50 700 95
           Q790 20 880 95 Q970 55 1060 95 Q1150 30 1240 95 Q1340 50 1440 95 V140 Z"
      />
      <path
        fill={front}
        d="M0 140 V115 Q120 60 240 115 Q360 75 480 115 Q600 55 720 115
           Q840 70 960 115 Q1080 60 1200 115 Q1320 75 1440 115 V140 Z"
      />
    </svg>
  );
}

// usage at the bottom of the hero:
// <HillsDivider className="w-full h-16 md:h-28 -mb-px" front="#FFFFFF" />
// usage above a Mist section: front="#EAF4FF"
```

### 12.7 Photography Guide
- Use only photos you took or have permission to use. Do not download images from Google or Facebook.
- Hero and trips: cars at the Chocolate Hills viewpoint, Loboc River, the Bilar forest road, Panglao and Alona beaches. Golden hour, clean cars, no identifiable faces without permission.
- Car photos (per car): front three-quarter, side, rear, dashboard, interior and trunk. Same crop everywhere (4:3 for cards, 16:9 for the hero). Uploads are converted to WebP.
- Until real photos exist, use a blue gradient with the hills divider as the placeholder. Do not use stock photos of other places (Boracay, El Nido).

### 12.8 Component Notes

| Component | Design notes |
|---|---|
| Primary button | Sea Blue, `rounded-full`, `h-12` on mobile, white text |
| Secondary button | White with a Sea Blue border and text |
| Mode toggle (Self-drive / With driver) | Segmented control, selected side Sea Blue with white text, steering-wheel and driver icons |
| Car card | `rounded-2xl`, large photo, price pill, spec chips in Mist |
| Badges | Pill shapes, colors from the status table |
| Date range picker | Selected range in Sea Blue, unavailable dates struck through in light gray |
| Price summary | Card with days times rate, deposit due now (large), balance at pickup |
| Empty states | Simple hills illustration with a friendly message |
| Toasts | `sonner`, white with a blue accent |

### 12.9 Accessibility and Performance
- Text contrast at least 4.5:1. Do not put small text in Sky on white.
- Visible focus ring (Sky), tap targets at least 44x44 px.
- Hero image under about 200 KB, WebP, `next/image` with `priority`. No autoplay video.
- Every image has meaningful alt text.
- Test on a mid-range phone with a slow connection.

---

## 11. Open Questions for the Owner of the Project

- Photos: who will take real photos of the cars at Bohol places?
- Guest booking or required account for the first release?
- Contact details to show (phone, Facebook page, email)?
- Final cancellation and fuel policy text for the FAQ
