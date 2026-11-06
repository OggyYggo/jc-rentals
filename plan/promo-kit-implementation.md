# Promo Kit: Downloadable Social Media Templates with QR (Implementation Brief)

Owners can download ready-made promo images, posters, and stickers for their cars. Every template carries the Kuyog Bohol branding and a **QR code and short link** that opens the car's page on the site, so bookings go through the platform.

**Stack:** Next.js (App Router), Supabase, shadcn/ui. New packages: `qrcode`, `pdf-lib`. Images are generated with `next/og` (`ImageResponse`), which is built into Next.js.

**Design rule:** the Promo Kit screens inside `/owner` keep the present dashboard design. The **generated templates** use the blue and white public brand from `customer-home-implementation.md` section 12 (Sea Blue `#0B63CE`, Deep Sea `#0A3D91`, Navy `#0F2342`, Mist `#EAF4FF`, white).

---

## 1. Goals

1. An owner can promote any of their cars in under one minute, with no design skills.
2. Every shared image and link brings the customer back to the site (not to the owner's private chat).
3. The platform can see which owner and which template brought each booking (analytics only; the 5% fee is the same for every booking).

## 2. Scope

**Phase 1 (build first)**
- "Promote" page per car with share buttons, copy link, copy caption
- Square post template (1080x1080) with QR
- Short links `/c/[code]` and the QR pointing to them
- Public link preview (Open Graph image) for car pages
- Attribution cookie, saved on the booking

**Phase 2**
- Story (1080x1920), Facebook cover (1640x624), A4 poster PDF, A6 car sticker
- General "Book a car in Bohol" template (QR to the home page)

**Phase 3**
- Click and booking stats per owner and per template
- More caption styles, optional Filipino/Bisaya captions reviewed by a local speaker

**Not in scope:** posting to Facebook automatically on behalf of owners (needs app review and permissions). Owners post themselves.

---

## 3. Owner Screens

| Route | Purpose |
|---|---|
| `/owner/promote` | List of the owner's cars with a "Promote" button each, plus the general brand kit |
| `/owner/promote/[carId]` | Preview of each template, download buttons, share buttons, caption box |

**Promote page layout (`/owner/promote/[carId]`)**
1. Car summary (photo, name, price) and the short link with a **Copy link** button.
2. **Share row:** Facebook, Messenger, Viber, WhatsApp buttons (plain share URLs, see section 8).
3. **Templates grid:** preview image, size label, **Download PNG** (or **Download PDF** for the poster).
4. **Caption box:** 3 caption styles with a **Copy caption** button each. The link is inserted automatically.
5. **Tips card:** "Post the link, not your phone number, so bookings and payments stay protected."

Only the car's owner and admins can open these pages and the generation endpoints.

---

## 4. Templates

All templates share this content (adapt layout to size):

| Element | Source |
|---|---|
| Car photo (large, rounded) | First `car_photos` image, converted to JPEG/PNG for rendering |
| Car name and year | `cars` |
| Price pill | "From ₱X / day" using the lowest enabled rate (show both modes if both enabled) |
| Mode badges | "Self-drive" and/or "With driver" |
| Seats and transmission | `cars` |
| QR code | Short link, see section 6 |
| Text link under the QR | `kuyogbohol.com/c/xxxxxx` (readable, for people who can't scan) |
| "Offered by [business name]" | `owners.business_name` |
| Logo and tagline | "Kuyog Bohol · Car Rental in Bohol" |

**Do not put the owner's phone number or Messenger link on templates.**

| Template | Size (px) | Phase | Layout notes |
|---|---|---|---|
| Square post | 1080 x 1080 | 1 | Photo top 60%, white info panel below, QR bottom right |
| Story | 1080 x 1920 | 2 | Photo top half, large price pill, QR and "Scan to book" in the lower third. Keep 250 px free at top and bottom for app UI |
| Facebook cover | 1640 x 624 | 2 | Wide photo left, text and QR right. Keep important content in the central safe area |
| Poster (A4) | 2480 x 3508 (300 dpi) | 2 | Big photo, headline "Rent this car in Bohol", price, QR at least 4 cm wide. Delivered as PDF |
| Car sticker (A6) | 1240 x 1748 (300 dpi) | 2 | Large QR (at least 3.5 cm), short text, logo. Delivered as PDF |
| General brand post | 1080 x 1080 | 2 | "Book a car in Bohol. Self-drive or with a local driver." with the QR to the home page, no specific car |

**Visual style:** white background, Sea Blue price pill, Navy text, Deep Sea footer strip with the logo, the layered blue hills shape as a decorative edge. Rounded photo corners. Use the project's font (loaded as TTF/OTF for rendering).

---

## 5. Data Changes (Supabase)

```sql
-- 1. Short code per car (for short links and QR)
alter table cars add column short_code text unique;

-- Backfill existing cars (6 characters, no look-alike letters)
update cars
set short_code = substr(translate(encode(gen_random_bytes(8), 'base64'), '+/=0OIl1', 'abcdefg'), 1, 6)
where short_code is null;

-- 2. Attribution on bookings (analytics only)
alter table bookings
  add column ref_owner_id uuid references owners(id),
  add column ref_car_id uuid references cars(id),
  add column ref_src text;          -- e.g. post, story, poster, sticker, cover, share

-- 3. Optional click counters (no personal data stored)
create table promo_clicks (
  id uuid primary key default gen_random_uuid(),
  car_id uuid references cars(id) on delete cascade,
  owner_id uuid references owners(id) on delete cascade,
  src text,
  clicked_at timestamptz not null default now()
);
create index on promo_clicks (owner_id, clicked_at);

alter table promo_clicks enable row level security;
create policy "owner reads own clicks" on promo_clicks
  for select using (
    owner_id in (select id from owners where profile_id = auth.uid())
  );
create policy "admin all clicks" on promo_clicks
  for all using (public.current_role() = 'admin');
-- Inserts happen only from the server with the service role key.
```

Generate `short_code` in the app when a car is created. Retry if the unique constraint fails. Short codes never change after creation, because printed posters depend on them.

---

## 6. Short Links, QR, and Attribution

### 6.1 Short link route

`app/c/[code]/route.ts`

```ts
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin"; // service role, server only

export async function GET(req: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const src = req.nextUrl.searchParams.get("src") ?? "share";

  const supabase = createAdminClient();
  const { data: car } = await supabase
    .from("cars")
    .select("id, owner_id, is_active")
    .eq("short_code", code)
    .single();

  const base = process.env.NEXT_PUBLIC_SITE_URL!;
  if (!car || !car.is_active) return NextResponse.redirect(`${base}/cars`);

  // count the click (no personal data)
  await supabase.from("promo_clicks").insert({ car_id: car.id, owner_id: car.owner_id, src });

  const res = NextResponse.redirect(`${base}/cars/${car.id}`);
  res.cookies.set("kb_ref", JSON.stringify({ o: car.owner_id, c: car.id, s: src }), {
    maxAge: 60 * 60 * 24 * 30, // 30 days
    httpOnly: true,
    sameSite: "lax",
    secure: true,
    path: "/",
  });
  return res;
}
```

When `createBooking` runs, read the `kb_ref` cookie and save `ref_owner_id`, `ref_car_id`, `ref_src`. Validate the IDs exist. If the cookie is missing or invalid, leave them empty.

**Rule:** attribution does not change the fee. The platform fee is the same 5% for every booking.

### 6.2 QR generator

```ts
// lib/promo/qr.ts
import QRCode from "qrcode";

export async function qrDataUrl(url: string, size = 600) {
  return QRCode.toDataURL(url, {
    errorCorrectionLevel: "M",
    margin: 2,                // quiet zone (white border)
    width: size,
    color: { dark: "#0A3D91", light: "#FFFFFF" },
  });
}

export function carShortUrl(code: string, src: string) {
  return `${process.env.NEXT_PUBLIC_SITE_URL}/c/${code}?src=${src}`;
}
```

QR rules:
- Dark blue on white, with the white border kept.
- Error correction **M**, and **H** only if a small logo is placed in the middle.
- Print size at least 2.5 cm (poster: 4 cm or more, sticker: 3.5 cm or more).
- Test with at least 3 phones before the owners print anything.
- The QR carries only the short link. The `src` value changes per template (`post`, `story`, `poster`, `sticker`, `cover`).

### 6.3 Domain warning
Right now the site runs on a test domain (`jc-rentals.vercel.app`). **Do not print posters or stickers until the final domain is set**, because the QR and link are fixed once printed. Use `NEXT_PUBLIC_SITE_URL` everywhere and set it to the final domain before launch.

---

## 7. Image Generation

### 7.1 Endpoint

`app/api/promo/[carId]/[template]/route.tsx`

```tsx
import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { createClient } from "@/lib/supabase/server";
import { qrDataUrl, carShortUrl } from "@/lib/promo/qr";
import { TEMPLATES } from "@/lib/promo/templates";
import { loadCarForPromo } from "@/lib/promo/data";

export const runtime = "nodejs";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ carId: string; template: string }> }
) {
  const { carId, template } = await params;
  const tpl = TEMPLATES[template as keyof typeof TEMPLATES];
  if (!tpl) return new Response("Unknown template", { status: 404 });

  // 1. Auth: only the car's owner or an admin
  const supabase = await createClient();
  const car = await loadCarForPromo(supabase, carId); // returns null if not allowed (RLS + role check)
  if (!car) return new Response("Forbidden", { status: 403 });

  // 2. Assets
  const font = await readFile(path.join(process.cwd(), "assets/fonts/PlusJakartaSans-Bold.ttf"));
  const qr = await qrDataUrl(carShortUrl(car.short_code, tpl.src));
  const photo = await loadPhotoAsJpegDataUrl(car.photo_path); // convert WebP to JPEG with sharp first

  // 3. Render
  return new ImageResponse(
    tpl.render({ car, qr, photo }),
    {
      width: tpl.width,
      height: tpl.height,
      fonts: [{ name: "Brand", data: font, weight: 700, style: "normal" }],
      headers: {
        "Content-Disposition": `attachment; filename="kuyog-bohol-${car.short_code}-${template}.png"`,
        "Cache-Control": "private, max-age=300",
      },
    }
  );
}
```

Notes for the implementer:
- `ImageResponse` supports a subset of CSS (flexbox layout, no CSS grid). Use `display: "flex"` everywhere.
- It does **not** read WebP photos, so convert the car photo to JPEG or PNG with `sharp` before embedding.
- Fonts must be provided as TTF, OTF, or WOFF. Put them in `assets/fonts/`.
- Keep each template as a function in `lib/promo/templates.ts` returning JSX, with a `width`, `height`, and `src` value.
- Fall back to a blue gradient and the hills shape if a car has no photo.

### 7.2 PDF for poster and sticker

Render the poster PNG (2480x3508) from the same endpoint, then wrap it in a PDF:

```ts
import { PDFDocument } from "pdf-lib";

export async function pngToPdf(png: Uint8Array, widthPt: number, heightPt: number) {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([widthPt, heightPt]);        // A4 = 595 x 842 pt, A6 = 298 x 420 pt
  const img = await pdf.embedPng(png);
  page.drawImage(img, { x: 0, y: 0, width: widthPt, height: heightPt });
  return pdf.save();
}
```

### 7.3 Public link preview (for Facebook and Messenger)

Add `app/cars/[id]/opengraph-image.tsx` that renders a 1200x630 image (car photo, name, "From ₱X / day", logo). Also set `generateMetadata` with `title`, `description`, and `openGraph`. This is **public** and contains no QR and no owner contact details. After publishing a car, owners can use Facebook's Sharing Debugger to refresh the preview.

---

## 8. Share Buttons (no QR needed)

Plain links that open the app with the link ready:

| Platform | URL pattern |
|---|---|
| Facebook | `https://www.facebook.com/sharer/sharer.php?u={encodedLink}` |
| Messenger (mobile) | `fb-messenger://share/?link={encodedLink}` |
| Viber | `viber://forward?text={encodedCaptionAndLink}` |
| WhatsApp | `https://wa.me/?text={encodedCaptionAndLink}` |

Use the short link with `src=share`. On mobile, also offer the native Web Share API (`navigator.share`) when available.

---

## 9. Caption Templates

Placeholders: `{car}`, `{priceSelf}`, `{priceDriver}`, `{link}`, `{business}`.

**Short**
> {car} for rent in Bohol 🚗 From ₱{priceSelf}/day. Book here: {link}

**Detailed**
> Planning a Bohol trip? Rent the {car}: drive yourself or ride with a local driver. Self-drive from ₱{priceSelf}/day, with driver from ₱{priceDriver}/day. See dates and book online: {link}

**With-driver focus**
> Chocolate Hills, Loboc River, Panglao: let a local driver take you. {car} with driver from ₱{priceDriver}/day. Book online: {link}

Only show the lines for the modes the car actually offers. Never show fake prices. Add "Posted by {business}" only if the owner enables it.

---

## 10. Security and Privacy

- Template and download endpoints check that the signed-in user owns the car (or is admin). Never trust the `carId` from the URL alone.
- Public pages and public images show only **active** cars.
- No owner phone numbers, emails, or addresses appear on templates, link previews, or QR links.
- The short link and cookie store IDs only, no personal customer data.
- `promo_clicks` writes happen on the server only (service role key, never exposed to the browser).
- Rate-limit the generation endpoint (for example 30 requests per minute per user) and cache results for a few minutes.
- Only owners can see their own stats. Admins see everything.

---

## 11. Owner and Admin Stats (Phase 3)

Owner dashboard card: clicks, bookings from promo links, and a split by template (`post`, `story`, `poster`, `sticker`, `cover`, `share`) for the last 30 days.

Admin: same view per owner, to see who promotes actively. Use it to coach owners or reward the best promoters. It never changes the fee.

---

## 12. Acceptance Checklist

**Phase 1**
- [ ] Every car has a unique `short_code`, and `/c/[code]` redirects to the car page
- [ ] The square template downloads as a PNG with the correct car photo, price, owner name, and QR
- [ ] Scanning the QR with 3 different phones opens the correct car page
- [ ] Share buttons open Facebook, Messenger, Viber, and WhatsApp with the link ready
- [ ] Caption buttons copy text with the link filled in
- [ ] Pasting a car link in Facebook or Messenger shows a preview with the photo, name, and price
- [ ] Bookings made after a short-link visit save `ref_owner_id`, `ref_car_id`, and `ref_src`
- [ ] An owner cannot open or generate templates for another owner's car
- [ ] No phone numbers or emails appear on any template

**Phase 2**
- [ ] Story, cover, poster PDF, and sticker PDF download correctly
- [ ] Printed poster QR scans from at least 1 meter away
- [ ] General brand template works with no car selected

## 13. Open Questions

- Final domain name (needed before anything is printed)
- Logo file (SVG or high-resolution PNG) for the templates
- Should owners be allowed to add their own short tagline to templates?
- Is the "Offered by [business name]" line wanted on every template?
