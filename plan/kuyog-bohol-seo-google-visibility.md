# Kuyog Bohol — Google Visibility (SEO) (Instructions for Codex)

Goal: make **https://kuyogbohol.app** easy for Google to find, read and show, with local Bohol searches in mind ("car rental Bohol", "self-drive Bohol", "car with driver Bohol", "Panglao car rental").

> Next.js 16 here has breaking changes. Read the relevant guide in `node_modules/next/dist/docs/` (metadata, sitemap, robots, JSON-LD) before writing code.

**Do not change visible layouts or the booking, payment or admin logic.** This work only adds metadata, files and hidden data for search engines, plus small text fixes listed below. No database changes.

## 0. What the repo already has (verified, but re-check)

- Root metadata in `app/layout.tsx` (title is old: "Kuyog Bohol — Rental Business, Simplified", which describes a SaaS, not car rental).
- Per-page metadata: `app/page.tsx`, `app/apply/page.tsx`, `app/for-owners/page.tsx`, `app/apply/received/page.tsx`, `app/account/profile/page.tsx`. `app/cars/[id]/page.tsx` has `generateMetadata` and a per-car `opengraph-image.tsx`.
- **Missing:** `app/sitemap.ts`, `app/robots.ts`, `metadataBase`, canonical URLs, metadata on `/cars`, `/contact`, `/terms`, `/login`, `/signup`, structured data (JSON-LD), and a default share image.
- `NEXT_PUBLIC_SITE_URL` is used in several places. `app/apply/actions.ts` falls back to `https://kuyogbohol.com`, which is the wrong domain.
- Public pages: `/`, `/cars`, `/cars/[id]`, `/for-owners`, `/apply`, `/contact`, `/terms`. Private pages: `/account`, `/admin`, `/admin-setup`, `/owner`, `/owner-setup`, `/auth`, `/login`, `/signup`, `/notifications`, `/api`, `/c/[code]`.

Report anything that differs before coding.

## 1. Site URL helper

Create `lib/site-url.ts`:
```ts
export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || "https://kuyogbohol.app").replace(/\/$/, "");
```
- Use it for `metadataBase`, the sitemap, robots and JSON-LD.
- In `app/apply/actions.ts`, change the fallback `https://kuyogbohol.com` to `SITE_URL`.
- Add a note to `.env.example`: `NEXT_PUBLIC_SITE_URL=https://kuyogbohol.app` for production. In Vercel, set it for **Production** to `https://kuyogbohol.app` (Jabez sets this; do not hardcode secrets).

## 2. Root metadata (`app/layout.tsx`)

Replace the old metadata object with:
```ts
export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: "Kuyog Bohol: Car Rental in Bohol, Self-Drive and With Driver", template: "%s | Kuyog Bohol" },
  description: "Rent a car in Bohol from local owners. Drive yourself or hire a car with a driver. Book online in minutes.",
  applicationName: "Kuyog Bohol",
  alternates: { canonical: "/" },
  openGraph: { type: "website", siteName: "Kuyog Bohol", locale: "en_PH", url: "/", images: [{ url: "/opengraph-image", width: 1200, height: 630, alt: "Kuyog Bohol car rental in Bohol" }] },
  twitter: { card: "summary_large_image" },
  appleWebApp: { capable: true, title: "Kuyog Bohol", statusBarStyle: "default" },
};
```
Keep the existing `appleWebApp` values. Because of the `template`, remove the trailing " | Kuyog Bohol" from page titles that already include it, so titles do not repeat the name (check `app/apply`, `app/for-owners`, `app/cars/[id]`, `app/page.tsx`; the home page can use `title: { absolute: ... }`).

Create `app/opengraph-image.tsx` (1200×630, brand blue `#0A47B1`, white Kuyog Bohol wordmark or text, line "Car Rental in Bohol", sub-line "Self-drive or with a local driver · kuyogbohol.app"), following the pattern of the existing `app/cars/[id]/opengraph-image.tsx`.

## 3. Page-level metadata and canonicals

Add or fix, each with a unique title (under 60 characters), a description (110 to 160 characters) and `alternates.canonical`:
- `/` : keep the current title and description; add `alternates: { canonical: "/" }`.
- `/cars` : "Cars for Rent in Bohol" with a description about self-drive and with-driver cars from local owners.
- `/cars/[id]` : keep the existing `generateMetadata`; add `alternates: { canonical: "/cars/" + id }`, and add the car's main photo to `openGraph.images` if the per-car OG image does not already cover it. Strip any `?mode=`, `?start=` or `?end=` query from the canonical so date filters do not create duplicate pages.
- `/for-owners`, `/apply` : keep; add canonicals.
- `/contact` : "Contact Kuyog Bohol".
- `/terms` : "Terms of Service".
- Pages that must stay out of Google get `robots: { index: false, follow: false }`: `/login`, `/signup`, `/apply/received`, `/account/*`, `/owner/*`, `/admin*`, `/notifications`, `/auth/*`. Put it in each layout or page metadata (a `layout.tsx` per private area is fine). Do not add `noindex` to public pages.

## 4. `app/robots.ts`

```ts
import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site-url";
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: ["/account", "/admin", "/admin-setup", "/owner", "/owner-setup", "/auth", "/api", "/notifications", "/login", "/signup", "/c/"] }],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
```
Check that `proxy.ts` does not redirect crawlers away from `/robots.txt` or `/sitemap.xml`. If it does (for example to `/login`), add those paths to the matcher exclusions.

## 5. `app/sitemap.ts`

- Static entries: `/`, `/cars`, `/for-owners`, `/apply`, `/contact`, `/terms`, with `lastModified` (build date is fine) and sensible `priority` (home 1, cars 0.9, others 0.5).
- Dynamic entries: every **active** car at `/cars/{id}`. Query with the **public/server Supabase client that already works for public car pages** (reuse the data helpers used by `app/cars/page.tsx`; do not use the service-role admin client in a public file unless the existing public pages already do). Include only cars that are `is_active = true` and belong to approved, active owners, using the same filter the public listing uses. Use the car's `updated_at` for `lastModified` if the column exists.
- Handle query failure by returning the static entries only. Never throw.
- Keep it fast. Revalidate hourly with `export const revalidate = 3600` (check this against the dynamic settings the project already uses, because the car pages use `connection()`).

## 6. Structured data (JSON-LD)

Create `components/seo/json-ld.tsx`:
```tsx
export function JsonLd({ data }: { data: object }) {
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, "\\u003c") }} />;
}
```
Escaping `<` is required.

Add:
1. **Home page (and site-wide in the root layout is also fine):** `Organization` + `WebSite` with name "Kuyog Bohol", `url`, `logo` (`/icon-512.png`), `email` kuyogbohol@gmail.com, `areaServed: "Bohol, Philippines"`, and `sameAs` with the Facebook page URL **only once Jabez provides it** (leave a clearly marked TODO; do not invent a URL).
2. **`/cars/[id]`:** a `Product` (with `name`, `description`, `image`, `brand`, `offers` with `priceCurrency: "PHP"`, `price` = lowest daily rate, `availability: "https://schema.org/InStock"`, and `url`). Use only real values from the car. **Do not add `aggregateRating` or `review` yet.** Add them only after real reviews exist and are shown on the page (see `kuyog-bohol-ratings-and-reviews.md`); fake or hidden ratings can get the site penalized.
3. Optional, only if the information is real and public: `LocalBusiness`/`AutomotiveBusiness` with the business address. Skip if there is no public address (service-area business).

Validate with Google's Rich Results Test and fix warnings.

## 7. Content and markup basics (small, safe changes)

1. Every public page has exactly one `<h1>` that includes the main phrase, for example the home page h1 mentions "car rental in Bohol". Do not redesign; adjust text only if the current h1 is missing or unclear.
2. All car images have descriptive `alt` text, for example "Toyota Vios 2022 for rent in Bohol". Check `next/image` usages on `/`, `/cars` and `/cars/[id]`.
3. Internal links use `<Link>` with real URLs. Car cards on `/cars` link to `/cars/[id]` as normal anchors.
4. Add a short, useful text block on `/cars` and `/` (two or three sentences) describing the service area and the two rental modes in natural language. Keep it brief.
5. Add `lang="en"` (already present). Consider `en-PH` only if no other part depends on it.

## 8. Performance (helps ranking and the "page experience" check)

Use `priority` on the first hero image only, set `sizes` on responsive images, and avoid layout shift on car cards. Do not start a larger performance project here.

## 9. Manual steps for Jabez (do not automate; list them in the final report)

1. **Google Search Console:** add a **Domain** property for `kuyogbohol.app`, verify it with the DNS TXT record at the domain provider.
2. Submit `https://kuyogbohol.app/sitemap.xml` under Sitemaps.
3. In **URL Inspection**, test the home page, `/cars` and one car page, then click **Request indexing**.
4. Create a **Google Business Profile** (service-area business if there is no public office). Use the same name, website and contact details as everywhere else.
5. Ask real customers for Google reviews after trips.
6. Put the site link on the Facebook page, Instagram and owners' pages.
7. Search `site:kuyogbohol.app` after one to two weeks. If pages are missing, check Search Console > Pages for the reason.
8. Make sure `www` redirects to one version in the Vercel domain settings.

## 10. Tests

1. `/robots.txt` and `/sitemap.xml` load without logging in and contain the expected rules and URLs. The sitemap lists active cars only and none of the private paths.
2. View source on `/`, `/cars` and one `/cars/[id]`: correct `<title>`, description, canonical (no query string), Open Graph tags and valid JSON-LD.
3. `/login`, `/signup`, `/account` and `/admin` return `noindex`. Public pages do not.
4. A private page is not listed in the sitemap.
5. Titles do not repeat "Kuyog Bohol" twice.
6. Rich Results Test passes for a car page.
7. Share links of `/` and a car page in a chat app or the Facebook Sharing Debugger: image and title appear.
8. Visible pages look exactly the same as before.
9. `npm run lint`, `npx tsc --noEmit`, `npm run build`.

## 11. Out of scope

Paid ads, blog or article writing, backlinks, redesigns, reviews markup before real reviews exist, any database change.

## 12. Codex prompt

*"Read `kuyog-bohol-seo-google-visibility.md`. First report the current metadata, robots, sitemap and structured-data state and how public car data is fetched. Then implement sections 1 to 8: add `lib/site-url.ts`, fix the root metadata and `metadataBase`, add a default Open Graph image, page-level metadata and canonicals, `noindex` for private pages, `app/robots.ts`, `app/sitemap.ts` with active cars only, and JSON-LD (Organization, WebSite, and Product on car pages with no ratings). Replace the wrong `kuyogbohol.com` fallback with the site URL helper. Do not change visible layouts, booking or payment logic, or the database. Run lint, typecheck and build, validate the output as in section 10, and list the manual steps from section 9 for Jabez and anything you could not verify."*
