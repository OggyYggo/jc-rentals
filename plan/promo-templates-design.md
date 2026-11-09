# Kuyog Bohol: Promo Templates Design (v3, "Scan to Book")

Design spec and source for the downloadable promo images (post, story, cover, poster, sticker) that owners post on Facebook or print. File: `lib/promo/templates.tsx`. Rendered by `app/api/promo/[carId]/[template]/route.tsx` with `next/og` (Satori).

## 1. The idea

Solid blue, one clear action: **SCAN TO BOOK**. Top to bottom: brand header, big call to action, a white-bordered card with the car photo and QR, price pill, car name, white footer strip.

```
┌─────────────────────────────┐
│   [logo] Kuyog Bohol         │  brand header + tagline
│          Explore Bohol Your Way
│                              │
│       SCAN TO BOOK           │  Poppins Bold, white
│ ┌──────────┬───────────────┐ │
│ │  car     │   [ QR ]      │ │  white border card
│ │  photo   │  From ₱X/day  │ │  sky-blue pill
│ └──────────┴───────────────┘ │
│        Toyota Vios Ativ      │  car name
├─────────────────────────────┤
│ Kuyog Bohol | Car Rental In Bohol │  white footer strip
└─────────────────────────────┘
```

## 2. Design tokens (change these first)

| Token | Value | Used for |
|---|---|---|
| `C.bg` | `#0A47B1` | Background |
| `C.sky` | `#4DB8FF` | Price pill |
| `C.white` | `#FFFFFF` | Titles, card border, QR tile, footer strip |
| `#CFE3FF` | (inline) | Secondary text on blue |
| `C.bg` on white | `#0A47B1` | Footer text |
| `HEAD` | Poppins Bold | Headings, price, SCAN TO BOOK |
| `BODY` | Inter 400/700 | Everything else |
| `TAGLINE` | "Explore Bohol Your Way" | Under the brand name |

To restyle: change `C`, `HEAD`/`BODY`, or `TAGLINE`. Every template follows.

## 3. Formats

| Template | Size (px) | Output | Layout |
|---|---|---|---|
| `post` | 1080 x 1080 | PNG | Photo left, QR + price right, name below (matches the reference) |
| `story` | 1080 x 1920 | PNG | Stacked. Top 220 px blue and bottom 230 px white footer stay clear for app buttons |
| `cover` | 1640 x 624 | PNG | Photo left, text right. **No QR** (a screen can't scan itself); shows "Book at link" |
| `poster` | 2480 x 3508 | PDF (A4) | Stacked, QR 700 px (about 6 cm) |
| `sticker` | 1240 x 1748 | PDF (A6) | Stacked, QR 380 px (about 3.5 cm), meets the minimum scan size |
| `generalBrandTemplate` | 1080 x 1080 | PNG | Brand post with no car ("Book a car in Bohol") |

Stacked sizes are the `Stack` objects in `promoTemplate` (margin, top, footer, icon, brand, title, photoH, qr, pill, name, small). To make the poster photo shorter or the QR larger, edit those numbers.

## 4. Rules to keep

- **QR is dark on a white tile.** White-on-blue QRs fail on some Android scanners.
- **Smallest text is 20 px or more** so it stays readable in a feed.
- **No rate means "Ask for rates"**, never "From ₱Infinity".
- **Long car names shrink** (`fit()`); labels over 20 characters drop a size.
- **Satori limits:** flexbox only (every `div` needs `display:flex`), no WebP images (convert to PNG/JPEG before drawing), fonts must be TTF/OTF/WOFF.
- **Story safe zones:** do not put important content in the top 220 px or bottom 230 px.

## 5. Wiring it in

1. Load fonts in the route: `Poppins-Bold.ttf` (700), `Inter-Regular` (400), `Inter-Bold` (700).
2. Pass `logo` as a PNG data URI (the Kuyog Bohol mark or the tarsier logo).
3. Pass the car photo as PNG/JPEG data (convert from WebP with `sharp`).
4. `link` is the short link `https://<domain>/c/<code>`; the QR encodes the same link.

## 6. How to ask for changes

Open this file, edit sections 2 and 3, and send it back to me with a line like "make the pill orange and the poster photo shorter". The code below is the source of truth.

## 7. Source: `lib/promo/templates.tsx`

```tsx
import type { ReactElement } from "react";
import type { PromoCar } from "@/lib/promo/data";

/**
 * Kuyog Bohol promo templates (v3) — "Scan to Book" layout:
 * solid blue, logo on top, big SCAN TO BOOK, photo + QR card, price pill, car name, white footer strip.
 * Fonts to load in the ImageResponse route: "Poppins" 700 and "Inter" 400 + 700.
 * `logo` = data URI (PNG) of the Kuyog Bohol logo mark (use your tarsier logo here). Satori can't draw WebP.
 */

export const TEMPLATES = {
  post: { width: 1080, height: 1080, src: "post", output: "png" },
  story: { width: 1080, height: 1920, src: "story", output: "png" },
  cover: { width: 1640, height: 624, src: "cover", output: "png" },
  poster: { width: 2480, height: 3508, src: "poster", output: "pdf", pageWidth: 595, pageHeight: 842 },
  sticker: { width: 1240, height: 1748, src: "sticker", output: "pdf", pageWidth: 298, pageHeight: 420 },
} as const;

type PromoTemplateName = keyof typeof TEMPLATES;
type TemplateProps = { car: PromoCar; photo: string | null; qr: string; link: string; logo?: string | null };

const C = { bg: "#0A47B1", navy: "#0F2342", sky: "#4DB8FF", mist: "#EAF4FF", muted: "#51657F", white: "#ffffff" };
const HEAD = "Poppins, Inter, sans-serif";
const BODY = "Inter, sans-serif";
const TAGLINE = "Explore Bohol Your Way";

/* ---------- helpers ---------- */

function rateSummary(car: PromoCar) {
  const rates = car.rates.filter((r) => (r.mode === "self_drive" ? car.allows_self_drive : car.allows_with_driver));
  const values = rates.map((r) => Number(r.daily_rate)).filter((n) => Number.isFinite(n) && n > 0);
  return {
    rates,
    startingRate: values.length ? Math.min(...values) : null, // null → "Ask for rates" (no Infinity bug)
    rateLabels: rates.map((r) => `${r.mode === "self_drive" ? "Self-drive" : "With driver"} ₱${Number(r.daily_rate).toLocaleString()}`),
  };
}

const pricePill = (rate: number | null) => (rate === null ? "Ask for rates" : `From ₱${rate.toLocaleString()} / day`);
const carLabel = (car: PromoCar) => `${car.year ? `${car.year} ` : ""}${car.brand} ${car.model}`;
const shortLink = (link: string) => link.replace(/^https?:\/\//, "");
const fit = (text: string, big: number, small: number, limit: number) => (text.length > limit ? small : big);

function brandHeader(logo: string | null | undefined, icon: number, brand: number, tag: number) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: Math.round(icon * 0.25) }}>
      {logo && <img src={logo} width={icon} height={icon} style={{ width: icon, height: icon }} />}
      <div style={{ display: "flex", flexDirection: "column" }}>
        <span style={{ display: "flex", fontFamily: HEAD, fontSize: brand, fontWeight: 700, color: C.white, lineHeight: 1.05 }}>Kuyog Bohol</span>
        <span style={{ display: "flex", fontFamily: BODY, fontSize: tag, color: "#CFE3FF", marginTop: 4 }}>{TAGLINE}</span>
      </div>
    </div>
  );
}

function photoBox(photo: string | null, w: number, h: number, radius: number, logo?: string | null) {
  return photo ? (
    <img src={photo} width={w} height={h} style={{ width: w, height: h, objectFit: "cover", borderRadius: radius }} />
  ) : (
    <div style={{ display: "flex", width: w, height: h, alignItems: "center", justifyContent: "center", flexDirection: "column", borderRadius: radius, background: "linear-gradient(135deg,#1560D6,#0A3D91)", color: C.white, fontFamily: HEAD, fontSize: Math.round(h / 9), fontWeight: 700 }}>
      {logo && <img src={logo} width={Math.round(h / 4)} height={Math.round(h / 4)} style={{ width: Math.round(h / 4), height: Math.round(h / 4), marginBottom: 12 }} />}
      Kuyog Bohol
    </div>
  );
}

/** White tile with dark QR — scans on every phone (white-on-blue QRs fail on some Android scanners). */
function qrTile(qr: string, size: number, pad: number) {
  return (
    <div style={{ display: "flex", padding: pad, background: C.white, borderRadius: Math.round(pad * 1.3) }}>
      <img src={qr} width={size} height={size} style={{ width: size, height: size }} />
    </div>
  );
}

function pill(text: string, size: number) {
  return <div style={{ display: "flex", borderRadius: Math.round(size * 0.4), background: C.sky, color: C.white, fontFamily: HEAD, fontSize: size, fontWeight: 700, padding: `${Math.round(size * 0.3)}px ${Math.round(size * 0.7)}px`, whiteSpace: "nowrap" }}>{text}</div>;
}

function whiteFooter(height: number, size: number, textTop?: number) {
  return (
    <div style={{ display: "flex", height, alignItems: textTop ? "flex-start" : "center", justifyContent: "center", paddingTop: textTop ?? 0, background: C.white, color: C.bg, fontFamily: BODY, fontSize: size }}>
      Kuyog Bohol | Car Rental In Bohol
    </div>
  );
}

/* ---------- vertical layout: story, poster, sticker ---------- */

type Stack = { margin: number; top: number; footer: number; footerText: number; icon: number; brand: number; tag: number; title: number; photoH: number; qr: number; qrPad: number; pill: number; name: number; small: number; gap: number; radius: number; border: number };

function stackLayout({ car, photo, qr, link, logo }: TemplateProps, w: number, s: Stack, title = "SCAN TO BOOK"): ReactElement {
  const { rates, startingRate, rateLabels } = rateSummary(car);
  const label = carLabel(car);
  const modes = [car.allows_self_drive ? "Self-drive" : null, car.allows_with_driver ? "With driver" : null].filter(Boolean).join(" · ");
  const specs = [car.seats ? `${car.seats} seats` : null, car.transmission].filter(Boolean).join(" · ");
  const inner = w - s.margin * 2;
  return (
    <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", background: C.bg, fontFamily: BODY }}>
      <div style={{ display: "flex", height: s.top }} />
      <div style={{ display: "flex", flex: 1, flexDirection: "column", alignItems: "center", justifyContent: "space-evenly", padding: `0 ${s.margin}px` }}>
        {brandHeader(logo, s.icon, s.brand, s.tag)}
        <div style={{ display: "flex", fontFamily: HEAD, fontSize: s.title, fontWeight: 700, color: C.white, lineHeight: 1 }}>{title}</div>
        <div style={{ display: "flex", width: inner, border: `${s.border}px solid ${C.white}`, borderRadius: s.radius + s.border, overflow: "hidden" }}>{photoBox(photo, inner - s.border * 2, s.photoH, s.radius, logo)}</div>
        <div style={{ display: "flex", alignItems: "center", gap: s.gap, width: inner, justifyContent: "center" }}>
          {qrTile(qr, s.qr, s.qrPad)}
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", color: C.white }}>
            {pill(pricePill(startingRate), s.pill)}
            <span style={{ display: "flex", marginTop: Math.round(s.gap * 0.45), fontSize: fit(label, s.name, Math.round(s.name * 0.78), 20), fontWeight: 700, lineHeight: 1.1, maxWidth: inner - s.qr - s.qrPad * 2 - s.gap }}>{label}</span>
            <span style={{ display: "flex", marginTop: 8, fontSize: s.small, color: "#CFE3FF" }}>{[modes, specs].filter(Boolean).join(" · ")}</span>
            {rates.length > 1 && <span style={{ display: "flex", marginTop: 4, fontSize: s.small, color: "#CFE3FF" }}>{rateLabels.join(" · ")}</span>}
            <span style={{ display: "flex", marginTop: 8, fontSize: s.small, color: C.white }}>{shortLink(link)}</span>
          </div>
        </div>
      </div>
      {whiteFooter(s.footer, s.footerText, s.footer > 140 ? Math.round(s.footer * 0.16) : undefined)}
    </div>
  );
}

/* ---------- main switch ---------- */

export function promoTemplate(name: PromoTemplateName, props: TemplateProps): ReactElement {
  if (name === "post") return squarePromoTemplate(props);

  if (name === "story") // top 220 px blue + bottom 230 px white footer stay clear for the app UI
    return stackLayout(props, 1080, { margin: 58, top: 220, footer: 230, footerText: 30, icon: 84, brand: 54, tag: 26, title: 112, photoH: 520, qr: 290, qrPad: 14, pill: 34, name: 44, small: 24, gap: 28, radius: 28, border: 4 });

  if (name === "poster")
    return stackLayout(props, 2480, { margin: 150, top: 140, footer: 210, footerText: 70, icon: 200, brand: 128, tag: 60, title: 250, photoH: 1480, qr: 700, qrPad: 32, pill: 82, name: 100, small: 54, gap: 70, radius: 64, border: 8 }, "SCAN TO BOOK");

  if (name === "sticker")
    return stackLayout(props, 1240, { margin: 70, top: 60, footer: 110, footerText: 34, icon: 100, brand: 64, tag: 30, title: 126, photoH: 680, qr: 380, qrPad: 18, pill: 40, name: 52, small: 26, gap: 34, radius: 34, border: 5 });

  /* COVER 1640x624 — a screen can't scan itself, so: photo, big link, price */
  const { car, photo, link, logo } = props;
  const { startingRate } = rateSummary(car);
  const label = carLabel(car);
  const modes = [car.allows_self_drive ? "Self-drive" : null, car.allows_with_driver ? "With driver" : null].filter(Boolean).join(" · ");
  return (
    <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", background: C.bg, fontFamily: BODY }}>
      <div style={{ display: "flex", flex: 1, alignItems: "center", gap: 56, padding: "0 72px" }}>
        <div style={{ display: "flex", border: "5px solid white", borderRadius: 38, overflow: "hidden" }}>{photoBox(photo, 700, 430, 30, logo)}</div>
        <div style={{ flex: 1, display: "flex", flexDirection: "column", color: C.white }}>
          {brandHeader(logo, 70, 44, 24)}
          <div style={{ display: "flex", marginTop: 30, fontFamily: HEAD, fontSize: fit(label, 56, 44, 20), fontWeight: 700, lineHeight: 1.1 }}>{label}</div>
          <div style={{ display: "flex", marginTop: 10, fontSize: 26, color: "#CFE3FF" }}>{modes}</div>
          <div style={{ display: "flex", marginTop: 22, alignSelf: "flex-start" }}>{pill(pricePill(startingRate), 32)}</div>
          <div style={{ display: "flex", marginTop: 22, fontFamily: HEAD, fontSize: 32, fontWeight: 700 }}>Book at {shortLink(link)}</div>
        </div>
      </div>
      {whiteFooter(70, 26)}
    </div>
  );
}

/* ---------- SQUARE POST 1080x1080 (matches the reference) ---------- */

export function squarePromoTemplate({ car, photo, qr, link, logo }: TemplateProps): ReactElement {
  const { startingRate } = rateSummary(car);
  const title = `${car.brand} ${car.model}`;
  return (
    <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", background: C.bg, fontFamily: BODY }}>
      <div style={{ display: "flex", flex: 1, flexDirection: "column", alignItems: "center", justifyContent: "space-evenly", padding: "20px 82px 0" }}>
        {brandHeader(logo, 84, 50, 26)}
        <div style={{ display: "flex", fontFamily: HEAD, fontSize: 104, fontWeight: 700, color: C.white, lineHeight: 1 }}>SCAN TO BOOK</div>
        <div style={{ display: "flex", width: 916, height: 510, border: "4px solid white", borderRadius: 40, overflow: "hidden" }}>
          <div style={{ display: "flex", width: 484, height: 502 }}>{photoBox(photo, 484, 502, 0, logo)}</div>
          <div style={{ display: "flex", flex: 1, flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 22 }}>
            {qrTile(qr, 250, 14)}
            {pill(pricePill(startingRate), 28)}
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", color: C.white }}>
          <span style={{ display: "flex", fontSize: fit(title, 54, 42, 18), lineHeight: 1.1 }}>{title}</span>
          <span style={{ display: "flex", marginTop: 6, fontSize: 24, color: "#CFE3FF" }}>{[car.year, car.car_type, car.allows_self_drive ? "Self-drive" : null, car.allows_with_driver ? "With driver" : null].filter(Boolean).join(" · ")}</span>
        </div>
      </div>
      <div style={{ display: "flex", height: 20 }} />
      {whiteFooter(96, 30)}
    </div>
  );
}

/* ---------- GENERAL BRAND POST (no car) ---------- */

export function generalBrandTemplate(qr: string, link: string, logo?: string | null): ReactElement {
  return (
    <div style={{ width: 1080, height: 1080, display: "flex", flexDirection: "column", background: C.bg, fontFamily: BODY }}>
      <div style={{ display: "flex", flex: 1, flexDirection: "column", alignItems: "center", justifyContent: "space-evenly", padding: "20px 82px 0" }}>
        {brandHeader(logo, 100, 60, 30)}
        <div style={{ display: "flex", fontFamily: HEAD, fontSize: 92, fontWeight: 700, color: C.white, lineHeight: 1.05, textAlign: "center" }}>Book a car in Bohol</div>
        <div style={{ display: "flex", fontSize: 36, color: "#CFE3FF" }}>Self-drive or with a local driver.</div>
        <div style={{ display: "flex", alignItems: "center", gap: 30, border: "4px solid white", borderRadius: 40, padding: 24 }}>
          {qrTile(qr, 260, 14)}
          <div style={{ display: "flex", flexDirection: "column", color: C.white }}>
            <span style={{ display: "flex", fontFamily: HEAD, fontSize: 36, fontWeight: 700 }}>SCAN TO BROWSE</span>
            <span style={{ display: "flex", marginTop: 10, fontSize: 26, color: "#CFE3FF" }}>{shortLink(link)}</span>
          </div>
        </div>
      </div>
      <div style={{ display: "flex", height: 20 }} />
      {whiteFooter(96, 30)}
    </div>
  );
}
```
