# "Sit back. Let a local show you Bohol." — Section Spec

A landing page section that encourages customers to book a car **with a driver**. It sits between the Featured cars area and "Book in three steps" in the page flow, and the navbar link **With a driver** jumps to it.

**Stack:** Next.js 16 (App Router), React 19, Tailwind 4, shadcn/ui, `next/image`.
**Section id:** `trips` (keep it, the navbar anchor `#trips` points here).

Related: `kuyog-bohol-landing-page-design.md` (tokens, margins), `kuyog-bohol-find-a-car-flow.md` (button destinations).

---

## 1. Purpose

Many tourists do not want to drive in an unfamiliar place. This section gives them clear reasons to choose a driver, shows what it feels like, and sends them straight to cars that offer a driver.

Success = more clicks on **Find a car with driver** and more bookings with `mode=driver`.

---

## 2. Layout

Background white. Vertical padding **96px** desktop, **56px** mobile. Side margin **140px** desktop, **20px** mobile.

### Desktop (1440px)

Two equal columns, gap **72px**, vertically centered:

```
┌──────────────────────────────┬──────────────────────────────┐
│  PHOTO SHOWCASE (560px tall) │  Tag                         │
│  ┌────────────┬───────────┐  │  Headline                    │
│  │            │ Loboc     │  │  Paragraph                   │
│  │   Main     │ River     │  │  4 benefits                  │
│  │   photo    ├───────────┤  │  [Find a car with driver]    │
│  │            │ Panglao   │  │  With driver from ₱X / day   │
│  │            │ beach     │  │  Prefer to drive? link       │
│  └────────────┴───────────┘  │                              │
└──────────────────────────────┴──────────────────────────────┘
```

### Mobile (390px)

Single column, in this order: photo showcase, tag, headline, paragraph, benefits, price line, full-width button, "prefer to drive" link.

---

## 3. Copy (use exactly)

| Element | Text |
|---|---|
| Tag | `RIDE WITH A LOCAL DRIVER` |
| Headline (h2) | **Sit back. Let a local show you Bohol.** |
| Paragraph | No license, no maps, no parking stress. Pick a car with a driver and spend your day looking at the view instead of the road. |
| Button | **Find a car with driver** |
| Price line | With driver from **₱[X,XXX] / day** (real lowest with-driver price from the database) |
| Secondary link | Prefer to drive yourself? See self-drive cars → |

### Benefits (icon, title, text)

| Icon | Title | Text |
|---|---|---|
| ID card | No license needed | Book a driver and just enjoy the ride. |
| Map pin | Knows the roads | Local drivers know the best stops and the shortest way. |
| Sun | Relax and enjoy the view | No maps, no parking, no stress. Just Bohol. |
| Two people | Great for families and groups | Everyone rides together in one car. |

---

## 4. Design tokens

| Token | Hex | Use |
|---|---|---|
| brand-600 | `#0B63CE` | Button, tag, links, avatar circle |
| brand-900 | `#0A3D91` | Button hover, badge text |
| ink-900 | `#0F2342` | Headline, benefit titles, price |
| ink-500 | `#51657F` | Paragraph, benefit text |
| sky-50 | `#EAF4FF` | Benefit icon tiles |
| white | `#FFFFFF` | Section background, floating cards |

Fonts: **Inter** for tag, headline, benefit titles and buttons. **Work Sans** for paragraph and small text.

---

## 5. Photo showcase

Three photos in a grid. Desktop: columns `1.3fr 1fr`, two rows, gap **14px**, total height **560px**. The main photo spans both rows. Radius **24px**. Mobile: main photo full width (height **250px**), then two photos side by side (height **130px**), gap **10px**, radius **18px**.

| Slot | Content | Overlays |
|---|---|---|
| **Main** (large) | A photo of a driver with happy guests next to the car, or guests enjoying a Bohol view | Dark gradient at the bottom (`transparent` to `rgba(15,35,66,.78)`); top-left white badge **No license needed** with an ID icon; bottom floating card **Local driver included** |
| **Top right** | Loboc River cruise or countryside | Bottom gradient; bottom-left white pill with a pin icon and **Loboc River** |
| **Bottom right** | Panglao or Alona beach | Bottom gradient; bottom-left white pill with a pin icon and **Panglao beach** |

**Floating card (on the main photo):**
- White, radius 18px, padding 14px, soft shadow `0 16px 40px rgba(15,35,66,.25)`, 18px from the left, right and bottom edges.
- A 48px blue circle with a white driver icon (42px on mobile).
- Title **Local driver included** (Inter 700, 16px).
- Text *Knows the way and the best stops.* (13px, `#51657F`).

**Badge and pills:** white at 92% opacity, `#0A3D91` text, Inter 700, 13 to 14px, fully rounded.

### Photo guidance (what to shoot or pick)

- The **main** photo matters most: people, a car, a smiling driver, and a Bohol background. Photos with people riding convert better than empty scenery.
- Landscape or square crops both work. The main slot is portrait-ish (about 4:5 on desktop), so keep the subject near the center.
- Size: at least **1200px** on the long side for the main photo, **800px** for the others. Export as **WebP or JPG**, under about 250KB each.
- Always write real `alt` text (for example "Driver and guests beside a car at the Chocolate Hills").
- Only use photos you own or have permission to use, and get consent from the people shown.

Placeholder state while you do not have photos yet: use the brand gradient (`linear-gradient(160deg,#7CC4FF,#0B63CE)`) and a small **Photo spot** label. Remove the label when the real photo is in.

---

## 6. Component

```
components/home/RideWithDriver.tsx      // server component
components/home/DriverPhotoShowcase.tsx // server component
```

```tsx
// components/home/RideWithDriver.tsx
import Link from "next/link";
import { ArrowRight, IdCard, MapPin, Sun, Users } from "lucide-react";
import { carsUrl } from "@/lib/cars/searchParams";
import { DriverPhotoShowcase } from "./DriverPhotoShowcase";

const BENEFITS = [
  { icon: IdCard, title: "No license needed", text: "Book a driver and just enjoy the ride." },
  { icon: MapPin, title: "Knows the roads", text: "Local drivers know the best stops and the shortest way." },
  { icon: Sun, title: "Relax and enjoy the view", text: "No maps, no parking, no stress. Just Bohol." },
  { icon: Users, title: "Great for families and groups", text: "Everyone rides together in one car." },
];

export function RideWithDriver({ lowestDriverPrice }: { lowestDriverPrice: number | null }) {
  return (
    <section id="trips" className="bg-white py-14 lg:py-24" aria-labelledby="driver-heading">
      <div className="mx-auto max-w-[1440px] px-5 lg:px-[140px]">
        <div className="grid items-center gap-8 lg:grid-cols-2 lg:gap-[72px]">
          <DriverPhotoShowcase />

          <div>
            <p className="text-xs font-semibold tracking-[2px] text-[#0B63CE] lg:text-[13px]">
              RIDE WITH A LOCAL DRIVER
            </p>
            <h2
              id="driver-heading"
              className="mt-3 font-heading text-[32px] font-bold leading-[38px] tracking-tight text-[#0F2342] lg:text-[44px] lg:leading-[52px]"
            >
              Sit back. Let a local show you Bohol.
            </h2>
            <p className="mt-4 max-w-[520px] text-base leading-[25px] text-[#51657F] lg:text-lg lg:leading-7">
              No license, no maps, no parking stress. Pick a car with a driver and spend your day
              looking at the view instead of the road.
            </p>

            <ul className="mt-7 flex flex-col gap-[18px] lg:mt-8 lg:gap-5">
              {BENEFITS.map(({ icon: Icon, title, text }) => (
                <li key={title} className="flex items-start gap-3.5 lg:gap-4">
                  <span className="flex size-11 flex-none items-center justify-center rounded-[14px] bg-[#EAF4FF] text-[#0B63CE] lg:size-12">
                    <Icon className="size-[22px] lg:size-6" aria-hidden />
                  </span>
                  <div>
                    <p className="font-heading text-base font-bold leading-[22px] text-[#0F2342] lg:text-lg lg:leading-6">{title}</p>
                    <p className="mt-0.5 text-sm leading-[21px] text-[#51657F] lg:text-[15px] lg:leading-[23px]">{text}</p>
                  </div>
                </li>
              ))}
            </ul>

            <div className="mt-7 flex flex-col gap-3 lg:mt-9 lg:flex-row lg:items-center lg:gap-7">
              {lowestDriverPrice != null && (
                <p className="text-center text-[15px] text-[#51657F] lg:order-2 lg:text-left">
                  With driver from <b className="text-[#0F2342]">₱{lowestDriverPrice.toLocaleString()} / day</b>
                </p>
              )}
              <Link
                href={carsUrl({ mode: "driver" })}
                className="inline-flex h-14 items-center justify-center gap-2.5 rounded-full bg-[#0B63CE] px-9 text-[17px] font-bold text-white hover:bg-[#0A3D91] lg:order-1"
              >
                Find a car with driver <ArrowRight className="size-[18px]" aria-hidden />
              </Link>
            </div>

            <Link
              href={carsUrl({ mode: "self" })}
              className="mt-4 flex justify-center text-[15px] font-semibold text-[#0B63CE] hover:underline lg:inline-flex lg:justify-start"
            >
              Prefer to drive yourself? See self-drive cars →
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
```

```tsx
// components/home/DriverPhotoShowcase.tsx
import Image from "next/image";
import { IdCard, MapPin, UserRound } from "lucide-react";

function Pill({ children }: { children: React.ReactNode }) {
  return (
    <span className="absolute bottom-3 left-3 inline-flex items-center gap-1.5 rounded-full bg-white/90 px-3 py-1.5 text-[13px] font-bold text-[#0A3D91]">
      <MapPin className="size-[15px]" aria-hidden />
      {children}
    </span>
  );
}

export function DriverPhotoShowcase() {
  return (
    <div className="grid grid-cols-2 gap-2.5 lg:h-[560px] lg:grid-cols-[1.3fr_1fr] lg:grid-rows-2 lg:gap-3.5">
      {/* Main */}
      <div className="relative col-span-2 h-[250px] overflow-hidden rounded-[18px] bg-[#0A3D91] shadow-[0_24px_60px_rgba(11,99,206,.18)] lg:col-span-1 lg:row-span-2 lg:h-auto lg:rounded-3xl">
        <Image src="/img/driver-main.webp" alt="Driver and guests beside a car in Bohol" fill priority sizes="(min-width:1024px) 40vw, 100vw" className="object-cover" />
        <div className="absolute inset-0 bg-gradient-to-b from-transparent from-[38%] to-[#0F2342]/80" />
        <span className="absolute left-3.5 top-3.5 inline-flex items-center gap-2 rounded-full bg-white/90 px-3.5 py-2 text-sm font-bold text-[#0A3D91] lg:left-[18px] lg:top-[18px]">
          <IdCard className="size-[17px]" aria-hidden /> No license needed
        </span>
        <div className="absolute inset-x-3.5 bottom-3.5 flex items-center gap-3 rounded-[18px] bg-white p-3 shadow-[0_16px_40px_rgba(15,35,66,.25)] lg:inset-x-[18px] lg:bottom-[18px] lg:p-3.5">
          <span className="flex size-[42px] flex-none items-center justify-center rounded-full bg-[#0B63CE] text-white lg:size-12">
            <UserRound className="size-[22px] lg:size-[26px]" aria-hidden />
          </span>
          <div className="min-w-0">
            <p className="font-heading text-[15px] font-bold leading-[21px] text-[#0F2342] lg:text-base">Local driver included</p>
            <p className="text-[13px] leading-[19px] text-[#51657F]">Knows the way and the best stops.</p>
          </div>
        </div>
      </div>

      {/* Top right */}
      <div className="relative h-[130px] overflow-hidden rounded-[18px] bg-[#0A3D91] lg:h-auto lg:rounded-3xl">
        <Image src="/img/driver-loboc.webp" alt="Loboc River countryside" fill sizes="(min-width:1024px) 22vw, 50vw" className="object-cover" />
        <div className="absolute inset-0 bg-gradient-to-b from-transparent from-50% to-[#0F2342]/60" />
        <Pill>Loboc River</Pill>
      </div>

      {/* Bottom right */}
      <div className="relative h-[130px] overflow-hidden rounded-[18px] bg-[#0A3D91] lg:h-auto lg:rounded-3xl">
        <Image src="/img/driver-panglao.webp" alt="Panglao beach" fill sizes="(min-width:1024px) 22vw, 50vw" className="object-cover" />
        <div className="absolute inset-0 bg-gradient-to-b from-transparent from-50% to-[#0F2342]/60" />
        <Pill>Panglao beach</Pill>
      </div>
    </div>
  );
}
```

Photo files go in `public/img/`: `driver-main.webp`, `driver-loboc.webp`, `driver-panglao.webp`. Make the lowest price come from the database (`min(price_with_driver)` over published cars that offer a driver). If there are no such cars, hide the price line.

---

## 7. Behavior

| Element | Action |
|---|---|
| **Find a car with driver** | Go to `/cars?mode=driver` (see the find-a-car flow spec) |
| **Prefer to drive yourself?** | Go to `/cars?mode=self` |
| Navbar **With a driver** | Scroll to `#trips` |
| Photos | Not clickable (decoration), no hover effect |

On the home page, the Featured cars tabs should also switch to **With driver** when the customer arrives from this button on the same page. On the real site this happens through the URL, so no extra code is needed.

**Hover and focus:** button hover `#0A3D91`; the link underlines on hover; all links show the 3px `#2E9BF0` focus outline with a 3px offset.

---

## 8. Accessibility

- The section is labeled by its `h2` (`aria-labelledby`).
- Benefits are a real list (`ul` and `li`).
- Icons are decorative (`aria-hidden`).
- Every photo has meaningful `alt` text.
- Text on photos sits on gradients or white cards, so contrast stays high. Do not put plain text directly over a bright photo.
- Respect `prefers-reduced-motion` if you add any entry animation (keep it to a gentle fade).

---

## 9. Performance

- Use `next/image` with correct `sizes`. Only the **main** photo has `priority` if this section is near the top of the page; otherwise leave `priority` off for all three and let them lazy load.
- Keep each image under about 250KB (WebP).
- Do not load images from other websites. Store them in `public/img` or Supabase Storage.

---

## 10. Optional improvements (later)

- Show the number of drivers or cars available ("12 cars with a driver").
- Rotate the main photo between a few approved photos.
- Add a short customer quote once you have real reviews. Do not invent quotes or ratings.
- Track clicks on **Find a car with driver** to see whether this section works.

---

## 11. Acceptance checklist

- [ ] The section matches the layout at 1440px (two columns, 72px gap) and 390px (single column).
- [ ] Side margins are 140px on desktop and 20px on mobile.
- [ ] All copy matches section 3 exactly.
- [ ] Three photos show in the grid layout with the badge, floating card and two location pills.
- [ ] **Find a car with driver** opens `/cars?mode=driver`; the self-drive link opens `/cars?mode=self`.
- [ ] The navbar **With a driver** link scrolls to this section.
- [ ] The price line shows the real lowest with-driver price, and hides when there is none.
- [ ] Images are WebP, under about 250KB, with real alt text.
- [ ] Keyboard focus is visible on both links.
- [ ] `npm run lint` and `npm run build` pass.
