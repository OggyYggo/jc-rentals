# Kuyog Bohol — Landing Page Design Spec

Hand this file to your developer (or to Claude Code) to build the customer landing page in Next.js 16, Tailwind 4 and shadcn/ui. It matches the Desktop (1440px) and Mobile (390px) boards in the design.

---

## 1. Design tokens

### Colors

| Token | Hex | Use |
|---|---|---|
| `brand-900` | `#0A3D91` | Hover states, deep blue |
| `brand-700` | `#0A47B1` | "How it works" band, logo tint |
| `brand-600` | `#0B63CE` | Primary buttons, icons, links |
| `brand-500` | `#2E9BF0` | Focus ring |
| `sky-50` | `#EAF4FF` | Soft section background, chips |
| `sky-100` | `#D6E6F7` | Borders |
| `sky-050` | `#E3EEF9` | Dividers |
| `ink-900` | `#0F2342` | Headings, footer background |
| `ink-500` | `#51657F` | Body text |
| `footer-text` | `#A9BCD3` | Footer paragraph |
| `white` | `#FFFFFF` | Navbar, cards |

### Fonts

| Role | Font | Weights |
|---|---|---|
| Headings, buttons, labels | **Inter** | 400, 500, 600, 700, 800 |
| Paragraphs and sub text | **Work Sans** | 400, 500, 600 |

```tsx
// app/layout.tsx
import { Inter, Work_Sans } from "next/font/google";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
const workSans = Work_Sans({ subsets: ["latin"], variable: "--font-work" });
```

```css
/* globals.css (Tailwind 4) */
@theme {
  --font-heading: var(--font-inter), system-ui, sans-serif;
  --font-sans: var(--font-work), system-ui, sans-serif;
}
```

### Layout

| | Desktop | Mobile |
|---|---|---|
| Side margin | **140px** each side | **20px** each side |
| Max content width | 1440px container, 140px padding | full width |
| Card radius | 24px | 20px |
| Pill buttons | `rounded-full`, 54px tall (44px in navbar) | 54px tall |

Note: there are **no mountain or wave shapes** anywhere. The hero and footer have flat edges.

---

## 2. Page structure (top to bottom)

1. Navbar (sticky)
2. Hero with search card
3. Trust strip
4. Popular trips
5. Featured cars
6. How it works (`id="how"`)
7. Why Kuyog Bohol
8. Owners band (`id="owners-band"`)
9. FAQ
10. Footer (`id="footer"`)

Section anchors used by the navbar: `#cars`, `#trips`, `#how`, `#owners-band`, `#footer`, `#top`.

---

## 3. Sections

### 3.1 Navbar (sticky)

- `position: sticky; top: 0; z-index: 50`
- **Solid white background**, with a 1px bottom border `#E3EEF9` and a soft shadow `0 6px 24px rgba(15,35,66,.08)`
- Height: 88px desktop, 72px mobile
- **Logo** is brand blue (`#0A47B1`). The supplied logo file is white, so export a blue or dark version for production and use a normal `<img>`.
- Desktop links (dark navy `#0F2342`, 15px, weight 500): Cars, Popular trips, How it works, List your car, Contact
- Right side: My bookings, Log in, then **Sign up**: blue background `#0B63CE`, **white text**, pill, 44px tall, hover `#0A3D91`
- Mobile: logo on the left, a 44px menu button (light blue `#EAF4FF`, icon `#0A3D91`) on the right

### 3.2 Hero

- Background: your Chocolate Hills photo as a cover image, with dark navy overlays so the text is readable
  - Desktop overlay: even `rgba(15,35,66,.52–.62)` across the width, plus a light blue tint `rgba(10,61,145,.16)` and a top fade
  - Mobile overlay: vertical gradient from `.82` to `.06`
- Height: desktop `min-height: 560px`; mobile has no fixed height and uses `padding-bottom: 128px`
- **All hero text is centered.**
- Content, in order:
  1. Tag pill: `CAR RENTAL IN BOHOL` (13px, weight 600, letter-spacing 2px, white text, translucent white background, white 35% border)
  2. H1: **Explore Bohol your way.** (Inter 600, 76px desktop / 46px mobile, line-height 1.04, white, max width 900px)
  3. Sub text: *Drive yourself or ride with a local driver. Book in minutes.* (Work Sans, 20px desktop / 17px mobile, white 90%)
  4. Highlights row: **Local owners, Clear pricing, Secure booking, 24/7 support**
     - Each has a small white line icon (22px) and white text (15px, weight 600)
     - Desktop: one centered row, 36px between items
     - Mobile: a 2×2 grid, max width 300px, centered
- **Floating search card** overlapping the hero's bottom edge (desktop: 62px overhang, width 1040px; mobile: 72px overhang, full width)
  - Mode toggle: **Self-drive / With driver** (segmented control, active = blue with white text)
  - Fields: Pickup date, Return date, Pickup location
  - Button: Search cars (blue pill)

### 3.3 Trust strip

Background `#EAF4FF`, 4 items in a row (2×2 on mobile). Each has a 48px white rounded icon tile and a label:

1. Verified local owners
2. Clear prices, no hidden fees
3. Small deposit to book
4. Documents kept private

### 3.4 Popular trips (`#trips`)

4 tiles, 380px tall, radius 24px, gradient backgrounds (replace with real photos later). Mobile: horizontal scroll row.

| Title | Text |
|---|---|
| Countryside day tour | Chocolate Hills, Loboc River, Bilar forest and tarsiers. |
| Panglao and Alona beach day | A relaxed day of white sand and clear water. |
| Island hopping transfer | Rides to the boat for dolphin watching and island hopping. |
| Airport or hotel transfer | A comfortable ride on arrival or departure. |

### 3.5 Featured cars (`#cars`)

6 car cards from your database. Each card shows:

- Photo (placeholder for now)
- Price pill: `From ₱X,XXX / day`
- Chips: seats, transmission
- Mode badges: Self-drive and/or With driver
- Button: View car

Desktop: 3 columns. Mobile: 1 column.

### 3.6 How it works (`#how`)

- Full-width blue band `#0A47B1`, with two faint translucent circles for depth
- **Desktop:** mascot on the left (about 420px wide, standing flush with the bottom edge). On the right: label `HOW IT WORKS`, heading **BOOK IN THREE STEPS** (Inter 700, 44px, uppercase, white), three translucent glass cards, then a white **Find your car** pill button.
- **Mobile:** heading, three cards, and the full-width button first, then the mascot centered at the bottom (about 220px wide).
- Glass card: `background: rgba(255,255,255,.10)`, border `rgba(255,255,255,.24)`, radius 20px. It holds a white circle icon (56px), a `STEP n` label, a title, text, and a large faint number (`rgba(255,255,255,.22)`) on the right.

| Step | Title | Text |
|---|---|---|
| 01 | Choose your car | Pick your dates, Self-drive or With driver, and a car. |
| 02 | Pay a small deposit | Scan the QR and upload your proof of payment. |
| 03 | Pick up and go | Meet the owner or driver, pay the balance, and enjoy Bohol. |

**Mascot:** the file in the design is a placeholder cut from a screenshot. Put your own transparent PNG at `public/img/mascot.png` and use `/img/mascot.png`. Best size: tall, about 800×1300 or larger.

### 3.7 Why Kuyog Bohol

Label `WHY KUYOG BOHOL`, heading **Rent a car the easy way**. Four cards:

| Title | Text |
|---|---|
| Local owners | Cars come from owners based in Bohol. |
| Two ways to travel | Drive yourself or ride with a driver. |
| Clear pricing | See what is included before you book. |
| Private documents | Your license and ID are stored securely. |

### 3.8 Owners band (`#owners-band`)

Text: **Own a car in Bohol? List it on Kuyog Bohol.** with a **List your car** button.

### 3.9 FAQ

Label `FAQ`, heading **Questions, answered**. Accordion, one item open at a time (first open by default), max width 880px, centered.

| Question | Answer |
|---|---|
| What do I need to rent self-drive? | A valid driver's license, a valid ID, and a small deposit to book. |
| Can I book with a driver instead? | Yes. With a driver, you do not need a license of your own. |
| How do I pay? | Pay a small deposit by QR to confirm your booking. You pay the balance to the owner at pickup. |
| What if I need to cancel? | You can cancel from My bookings before your start date while the booking is still pending. See the cancellation policy for details. |
| Is fuel included? | It depends on the listing. Fuel terms are shown on each car page. |
| Where do I pick up? | Pickup locations are shown on the car page and confirmed after you book. |

Use the shadcn `Accordion` (`type="single" collapsible`, `defaultValue="item-0"`).

### 3.10 Footer (`#footer`)

- Flat top edge, background `#0F2342`, white text
- Logo, then *Car rental in Bohol. Self-drive or with a local driver.*
- Links: Cars, How it works, List your car, Contact, Terms, Privacy
- Bottom line: © 2026 Kuyog Bohol. Car Rental in Bohol.

---

## 4. Suggested component split (Next.js)

```
components/landing/
  Navbar.tsx          // sticky, client component only if you add a mobile menu
  Hero.tsx
  SearchCard.tsx      // client component (mode toggle, date inputs)
  TrustStrip.tsx
  PopularTrips.tsx
  FeaturedCars.tsx    // server component, reads from Supabase
  HowItWorks.tsx
  WhyKuyog.tsx
  OwnersBand.tsx
  Faq.tsx             // shadcn Accordion
  Footer.tsx
```

Tailwind quick reference for the repeating patterns:

```tsx
// Page container (140px desktop, 20px mobile)
<div className="mx-auto max-w-[1440px] px-5 lg:px-[140px]">

// Primary pill button
<a className="inline-flex h-[54px] items-center rounded-full bg-[#0B63CE] px-9 font-semibold text-white hover:bg-[#0A3D91]">

// Sticky navbar
<header className="sticky top-0 z-50 flex h-[72px] items-center justify-between bg-white px-5 shadow-[0_1px_0_#E3EEF9,0_6px_24px_rgba(15,35,66,.08)] lg:h-[88px] lg:px-[140px]">
```

---

## 5. Assets you need to provide

| Asset | Where it is used | Notes |
|---|---|---|
| Hero photo (Chocolate Hills) | Hero background | Use `next/image` with `fill` and `priority`, `object-cover` |
| Logo, blue or dark version | Navbar | The white version goes in the footer |
| Mascot PNG (transparent) | How it works | `public/img/mascot.png` |
| Trip photos (4) | Popular trips | Replace the gradients |
| Car photos | Featured cars | From your listings |

---

## 6. Notes and open items

- The navbar stays white and solid at all times.
- The trust strip under the hero overlaps a little with the new hero highlights row. Keep one of them, or reword the strip.
- Prices on the car cards are placeholders (`₱X,XXX`). Pull real prices from your database.
- This design has not been checked against real content or a real browser yet. Check spacing at 1440px and 390px once it is built.
