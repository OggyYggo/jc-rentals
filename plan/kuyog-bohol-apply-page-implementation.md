# Task: Build the "Apply to list your car" page (Kuyog Bohol)

You are implementing a public page where a car owner can apply to list their car **without creating an account**. This file is the full brief. Read it fully before writing code.

## 0. Context

- **Project:** Kuyog Bohol, a car rental marketplace in Bohol, Philippines. Customers book cars, owners list cars, the admin approves owners and earns a 5% commission.
- **Stack:** Next.js 16 (App Router), React 19, TypeScript, Tailwind 4, shadcn/ui, Supabase (Postgres, Auth, Storage), Resend. Deployed on Vercel.
- **Follow the existing code.** Before you start, look at how the project already organizes routes, components, Supabase clients (`lib/supabase/*`), shadcn setup and the `cn()` helper. Reuse them. Do not add new UI libraries except those listed here.
- **Scope of this task:** the **UI**, the **client and server validation**, and the **server action** that saves the application. The admin review screens and the approval/invite logic are **out of scope** (they are in a separate spec, `kuyog-bohol-owner-application.md`). Do not build them.
- **Language and tone:** plain, friendly English. Short sentences. No jargon in user-facing text.

## 1. Deliverables

1. Route `app/apply/page.tsx` (the form page).
2. Route `app/apply/received/page.tsx` (the success screen).
3. Components in `components/apply/` (see section 6).
4. A server action `app/apply/actions.ts` that validates and saves the application.
5. A shared zod schema `lib/apply/schema.ts` used by both client and server.
6. The SQL migration for `owner_applications` and the private storage bucket (section 8).
7. Loading, error and empty states for every part (section 9).
8. Responsive layout: desktop 1440px and mobile 390px (section 3).

## 2. Design tokens

### Colors

| Token | Hex | Use |
|---|---|---|
| brand-900 | `#0A3D91` | Hover, deep blue |
| brand-700 | `#0A47B1` | Page header band |
| brand-600 | `#0B63CE` | Primary buttons, icons, links, focus border |
| focus ring | `#2E9BF0` | Keyboard focus outline |
| sky-50 | `#EAF4FF` | Page background, icon tiles, chips |
| sky-25 | `#F3F9FF` | Selected card and hover background |
| border | `#D6E6F7` | Input and card borders |
| divider | `#E3EEF9` | Section dividers |
| ink-900 | `#0F2342` | Headings, labels |
| ink-500 | `#51657F` | Body text |
| muted | `#8DA0B8` | Placeholder, optional tag |
| footer-bg | `#0F2342` | Footer |

Add them to the Tailwind theme (`@theme` in `globals.css`) if the project does not already have them.

### Fonts

- **Inter** (weights 400 to 800): headings, labels, buttons, numbers.
- **Work Sans** (400, 500, 600): paragraphs, inputs, helper text.

Use `next/font/google`. If the project already loads these, reuse them.

### Layout

- Desktop side margin: **140px**. Mobile side margin: **20px**.
- Container: `mx-auto max-w-[1440px] px-5 lg:px-[140px]`.
- Card radius: 24px desktop, 20px mobile. Inputs: 14px radius, 52px tall, 1.5px border.
- Pill buttons: `rounded-full`, 58px tall for the main submit, 44px in the navbar.

## 3. Page layout

Reuse the site's existing **Navbar** (sticky, white) and **Footer**. Do not rebuild them. The "List your car" links in the navbar, the footer and the landing page owners band must point to `/apply`. Label the owners band button **Apply to list your car**.

### 3.1 Page header band

- Full-width blue band `#0A47B1`, with two faint translucent circles (white at 4 to 5% opacity) for depth.
- Centered content:
  - Tag pill: `FOR CAR OWNERS` (13px, weight 600, letter-spacing 2px, white text, white 10% background, white 35% border).
  - `<h1>`: **Apply to list your car** (Inter 700, 56px/62px desktop, 36px/42px mobile, white).
  - Sub text: *Tell us about you and your car. We review every application and email you the result.* (19px desktop, 16px mobile, white 90%, max width 620px).
  - Desktop only: three glass pills in a row: **1 Send your application**, **2 We review it**, **3 Start earning** (white 12% background, white 24% border, a small white numbered circle).
- Padding: desktop `72px top / 128px bottom`, mobile `40px top / 96px bottom`. The bottom padding is what the form card overlaps.

### 3.2 Form area

- Background `#EAF4FF`.
- **Desktop:** two columns: form (flexible) and sidebar (**340px**), gap 40px. The form card overlaps the header band by **64px** (`-mt-16`). The sidebar starts 32px lower and is **sticky** (`sticky top-28`).
- **Mobile:** one column. The form card overlaps the band by 56px. The "What happens next" card and the safety note come **after** the form.

### 3.3 Sidebar (desktop) / after-form cards (mobile)

1. **What happens next** card with three numbered steps joined by a dashed vertical line:
   1. **Send your application**: Fill in the form. No account needed.
   2. **We review it**: We check your photos and documents, and may call you.
   3. **Set up your account**: Approved? You get an email to set your password and start earning.
2. **Have these ready** card with check items:
   - Clear photos of your car (3 to 8)
   - OR/CR (vehicle registration)
   - Your driver's license and a valid ID
   - Your payment QR code
3. **Safety note** (solid `#0A47B1` card, white text, shield icon): *We review every application to keep Kuyog Bohol safe for customers and owners.*

On mobile, show only cards 1 and 3.

## 4. The form

One `<form>` inside a white card (`border #D6E6F7`, soft shadow, `overflow-hidden`). Four sections separated by 1px dividers, then the submit area. Section padding: `36px 40px` desktop, `26px 20px` mobile.

Each section header: a 36px blue circle with the section number (white, Inter 700), the title (Inter 700, 22px), and under it a one-line description indented 50px.

Labels sit above inputs: 13px, weight 600, `#0F2342`. Optional fields add a muted "(optional)" after the label. Helper text: 12px, `#51657F`, 6px under the input.

### Section 1: About you
*We use this to contact you about your application.*

| Field | Name | Type | Required | Notes |
|---|---|---|---|---|
| Full name | `full_name` | text | yes | placeholder `Juan Dela Cruz` |
| Mobile number | `phone` | tel | yes | placeholder `09XX XXX XXXX` |
| Email address | `email` | email | yes | helper: *We will email you the result and your account invite here.* |
| Home address | `address` | text | no | placeholder `Barangay, town, Bohol` |

Desktop: name and mobile share a row. Email and address are full width.

### Section 2: Your car
*Tell us what you would like to list. You can add more cars later.*

| Field | Name | Type | Required | Notes |
|---|---|---|---|---|
| Make | `car_make` | text | yes | `Toyota` |
| Model | `car_model` | text | yes | `Innova` |
| Year | `car_year` | number | yes | 1990 to next year |
| Plate number | `plate_number` | text | yes | uppercase automatically, `ABC 1234` |
| Seats | `seats` | number | yes | 1 to 20 |
| Transmission | `transmission` | segmented control | yes | **Manual** or **Automatic** (default Automatic) |
| Fuel type | `fuel_type` | select | yes | Gasoline, Diesel, Hybrid, Electric |

Desktop: make and model in one row; year, plate and seats in a row of three; transmission and fuel in one row. Mobile: everything stacks, except year and seats share a row.

The segmented control is a rounded container (1.5px border, 4px padding) with two buttons; the active one is blue with white text. Use shadcn `ToggleGroup` (type single) or a radio group, and make sure it is keyboard accessible.

### Section 3: How you rent it
*Choose one or both. Customers see these as Self-drive and With driver.*

- Two **selectable cards** side by side on desktop (stacked on mobile):
  - **Self-drive** (steering wheel icon): *Customers drive the car themselves.* Rate field: **Daily rate (self-drive)**.
  - **With driver** (driver icon): *You or your driver take the customer.* Rate field: **Daily rate (with driver)**.
- Each card has a 26px checkbox at its left. **Unselected:** white background, `#D6E6F7` border, white box. **Selected:** `#F3F9FF` background, `#0B63CE` border, blue filled box with a white check.
- Rate inputs have a `₱` prefix and are numeric (PHP per day).
- Rule: **at least one** mode must be selected. A rate is **required and must be greater than 0** for each selected mode. Rate inputs of an unselected mode are disabled and ignored.
- Below the cards:
  - **Pickup location** (`pickup_location`, text, required): `e.g. Tagbilaran City, near the port`
  - **Notes** (`notes`, textarea, optional, max 500 characters): placeholder *Fuel policy, deposit, extra rules, anything customers should know.*

### Section 4: Photos and documents
*Clear, readable photos help us approve you faster.*

Five **upload rows**. Each row is a dashed-border (`1.5px dashed #B7CDE6`) rounded box with a 46px icon tile, a title, a hint line, and an **Upload** pill on the right (on mobile show only a 36px circular icon button). Hover: border `#0B63CE`, background `#F3F9FF`.

| Row | Name | Icon | Hint | Rule |
|---|---|---|---|---|
| Car photos | `car_photos` | image | 3 to 8 photos. JPG, PNG or WebP, up to 5MB each. | multiple, 3 to 8 files, images only |
| OR/CR (vehicle registration) | `orcr` | document | JPG, PNG or PDF, up to 5MB. | single, required |
| Driver's license | `license` | license card | JPG, PNG or PDF, up to 5MB. | single, required |
| Valid ID | `valid_id` | ID card | JPG, PNG or PDF, up to 5MB. | single, required |
| Payment QR code | `payment_qr` | QR | The QR where customers send their deposit. | single, image only, required |

Behavior of an upload row:
- Click or drag a file onto it (use a hidden `<input type="file">` and a visible button; the whole row is the target).
- After choosing, the row changes to a **filled state**: show a small thumbnail (images) or file icon (PDF), the file name, the size, and a **Remove** (x) button. Keep the blue Upload pill as **Replace**.
- Car photos show a small thumbnail grid (up to 8) with a count: *"5 of 8 photos"*.
- Validate on the client right away: type, size (5MB), count. Show the error under the row in red (`#C62828`) and a red border.
- Do **not** upload on select. Files are sent with the form on submit (see section 7). Show an upload progress state while submitting (section 9).

Under the rows, a notice box (`#EAF4FF`, lock icon): *Your documents are used only to verify your application and are stored privately. Customers never see them.*

### Submit area
Padding `8px 40px 40px` desktop, `8px 20px 28px` mobile.

1. Checkbox: **I agree to the Terms and the owner policy.** "Terms" and "owner policy" are blue links (open in a new tab). Required.
2. **Spam check:** Cloudflare Turnstile widget (managed mode) in a 66px bordered box. Required.
3. **Submit button** (full width, 58px, blue pill, white bold text, send icon): **Submit application**. While pending: spinner, disabled, text **Submitting…**.
4. Small centered text: *We usually reply by email. Nothing is published until we approve it.*

## 5. Application received page (`/apply/received`)

Same navbar and footer. Centered white card (max width 760px, radius 28px, soft blue shadow) on the `#EAF4FF` background:

- A 60px blue circle with a white check, inside an 84px pale ring.
- `<h1>`: **Application received** (Inter 700, 38px).
- Text: *Thank you. We sent a confirmation to **{email}**. We will review your application and reply by email.* If the email is not available, say *"your email"*.
- Three rows (icon circle, title, text):
  1. **Check your inbox**: Look for our confirmation email. Check spam if you do not see it.
  2. **We review your application**: This is when we check your photos and documents.
  3. **Set up your owner account**: If approved, we email you a link to set your password.
- Buttons: **Back to home** (blue pill), **Contact us** (white pill with border).

Pass the email through a short-lived, signed, `httpOnly` cookie (set by the server action, 10 minutes) instead of a URL query string. If someone opens `/apply/received` directly with no cookie, show the same page with the generic wording (do not redirect).

## 6. Component structure

```
app/apply/
  page.tsx                  // server component: header band + form layout
  actions.ts                // server action: submitApplication
  received/page.tsx
components/apply/
  ApplyHeader.tsx           // blue band
  ApplyForm.tsx             // "use client": form state, sections, submit
  FormSection.tsx           // numbered section wrapper
  Field.tsx                 // label + input + helper + error
  SegmentedControl.tsx      // transmission
  RentalModeCard.tsx        // self-drive / with driver card
  UploadRow.tsx             // single file upload row
  PhotoUploadRow.tsx        // multiple photos with thumbnails
  TurnstileBox.tsx          // captcha wrapper
  ApplySidebar.tsx          // what happens next + checklist + safety note
  NextSteps.tsx             // reusable numbered steps (sidebar and mobile)
lib/apply/
  schema.ts                 // zod schema + file rules (shared)
  constants.ts              // limits, fuel types, etc.
```

Use shadcn `Input`, `Textarea`, `Select`, `Checkbox`, `Button`, `Label` and `ToggleGroup` where they fit. Restyle them to the tokens above (52px height, 14px radius, `#D6E6F7` border, blue focus ring). Use `react-hook-form` with `@hookform/resolvers/zod` if the project already uses it; otherwise use the built-in form state with `useActionState`. Pick the approach that matches the codebase.

Icons: `lucide-react` (`Upload`, `Image`, `FileText`, `IdCard`, `QrCode`, `Lock`, `ShieldCheck`, `Check`, `Send`, `Mail`, `Eye`, `User`, `Car`, `CircleDot`).

## 7. Validation and the server action

### 7.1 Shared schema (`lib/apply/schema.ts`)

```ts
import { z } from "zod";

export const MAX_FILE_BYTES = 5 * 1024 * 1024;
export const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];
export const DOC_TYPES = [...IMAGE_TYPES, "application/pdf"];

const phone = z
  .string()
  .transform((v) => v.replace(/[\s-]/g, ""))
  .pipe(z.string().regex(/^(\+63|63|0)9\d{9}$/, "Enter a valid mobile number, like 09XX XXX XXXX."));

export const applicationSchema = z
  .object({
    full_name: z.string().trim().min(2, "Enter your full name.").max(100),
    phone,
    email: z.string().trim().toLowerCase().email("Enter a valid email address."),
    address: z.string().trim().max(200).optional(),

    car_make: z.string().trim().min(2, "Enter the car make.").max(50),
    car_model: z.string().trim().min(1, "Enter the car model.").max(50),
    car_year: z.coerce.number().int().min(1990, "Enter a valid year.").max(new Date().getFullYear() + 1),
    plate_number: z.string().trim().min(3, "Enter the plate number.").max(12).transform((v) => v.toUpperCase()),
    seats: z.coerce.number().int().min(1).max(20),
    transmission: z.enum(["manual", "automatic"]),
    fuel_type: z.enum(["gasoline", "diesel", "hybrid", "electric"]),

    offers_self_drive: z.boolean(),
    offers_with_driver: z.boolean(),
    daily_rate_self_drive: z.coerce.number().positive("Enter a daily rate.").optional(),
    daily_rate_with_driver: z.coerce.number().positive("Enter a daily rate.").optional(),
    pickup_location: z.string().trim().min(3, "Enter the pickup location.").max(200),
    notes: z.string().trim().max(500).optional(),

    agree: z.literal(true, { errorMap: () => ({ message: "Please agree to continue." }) }),
  })
  .superRefine((v, ctx) => {
    if (!v.offers_self_drive && !v.offers_with_driver)
      ctx.addIssue({ code: "custom", path: ["offers_self_drive"], message: "Choose at least one way to rent your car." });
    if (v.offers_self_drive && !v.daily_rate_self_drive)
      ctx.addIssue({ code: "custom", path: ["daily_rate_self_drive"], message: "Enter a daily rate." });
    if (v.offers_with_driver && !v.daily_rate_with_driver)
      ctx.addIssue({ code: "custom", path: ["daily_rate_with_driver"], message: "Enter a daily rate." });
  });

export function checkFile(file: File, allowed: string[]) {
  if (!allowed.includes(file.type)) return "This file type is not allowed.";
  if (file.size > MAX_FILE_BYTES) return "This file is bigger than 5MB.";
  return null;
}
```

Error messages are shown under the field, in red, in plain language. On submit with errors, scroll to and focus the first invalid field.

### 7.2 Server action (`app/apply/actions.ts`)

Do these steps **in this order**, and return a typed result `{ ok: true } | { ok: false; error?: string; fieldErrors?: Record<string, string[]> }`:

1. Verify the Turnstile token with Cloudflare (`https://challenges.cloudflare.com/turnstile/v0/siteverify`, secret in `TURNSTILE_SECRET_KEY`). Fail with *"Please complete the check and try again."*
2. Rate limit by IP: **max 3 applications per hour**. Use the existing rate limit helper if the project has one; otherwise count recent rows in `owner_applications` by `submitted_ip`.
3. Parse and validate the text fields with `applicationSchema`.
4. Validate files again on the server: count (3 to 8 photos), size, **MIME type and file extension both**, and that each required document exists.
5. Insert the row (status `pending`) with the **service role** client (`lib/supabase/admin.ts`, server only). On unique violation (open application for the same email, Postgres code `23505`) return *"We already have an open application for this email."*
6. Upload files to the **private** bucket `owner-applications` at `{application_id}/{kind}-{randomUUID}.{ext}`. Then update the row with the stored paths. If any upload fails, **delete the uploaded files and the row**, then return a friendly error. Never keep half applications.
7. Send the applicant a confirmation email through Resend. Use the project's existing Resend helper and brand template. Subject: *We received your application*. If sending fails, log it and continue (do not fail the application).
8. Create an in-app notification for each admin (`application_received`) using the project's existing `notify()` helper, if present. If the helper does not exist yet, leave a clear `TODO` and skip.
9. Set the `apply_email` cookie (signed, httpOnly, 10 minutes) and `redirect("/apply/received")`.

Security rules:
- The service role key stays in server-only code. Never import the admin client in a client component. Never use a `NEXT_PUBLIC_` name for secrets.
- Do not trust the client for anything. Re-validate everything.
- Do not log file contents or full personal data.
- Keep the server action body size within Vercel limits: 8 photos plus 4 documents at 5MB each can be about 60MB, which is too large for one request. **Compress images in the browser before submit** (max 1600px on the long side, JPEG quality about 0.8, using `browser-image-compression` or a small canvas helper) and keep the real limit at 5MB **after** compression. If total request size is still a risk, switch to **signed upload URLs**: the action creates the row and returns signed upload URLs, the browser uploads files directly to Supabase Storage, then calls a second action `finalizeApplication(id)` that verifies the files exist and sends the emails. Choose the simpler approach that works within the platform limits, and note your choice in the PR description.

## 8. Database and storage

Create a migration (follow the project's migration folder and naming). If an `owner_applications` table already exists, **extend it** instead of creating a new one.

```sql
create type application_status as enum
  ('pending', 'needs_changes', 'approved', 'rejected', 'withdrawn');

create table if not exists public.owner_applications (
  id                      uuid primary key default gen_random_uuid(),
  status                  application_status not null default 'pending',

  full_name               text not null,
  email                   text not null,
  phone                   text not null,
  address                 text,

  car_make                text not null,
  car_model               text not null,
  car_year                int,
  plate_number            text,
  seats                   int,
  transmission            text check (transmission in ('manual','automatic')),
  fuel_type               text,
  offers_self_drive       boolean not null default true,
  offers_with_driver      boolean not null default false,
  daily_rate_self_drive   numeric(10,2),
  daily_rate_with_driver  numeric(10,2),
  pickup_location         text,
  notes                   text,

  car_photo_paths         text[] not null default '{}',
  orcr_path               text,
  license_path            text,
  id_path                 text,
  payment_qr_path         text,

  admin_note              text,
  reviewed_by             uuid references auth.users(id),
  reviewed_at             timestamptz,
  user_id                 uuid references auth.users(id),

  edit_token_hash         text,
  edit_token_expires_at   timestamptz,

  submitted_ip            inet,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);

create index if not exists owner_applications_status_created_idx
  on public.owner_applications (status, created_at desc);

-- One open application per email
create unique index if not exists owner_applications_one_open_per_email
  on public.owner_applications (lower(email))
  where status in ('pending', 'needs_changes');

alter table public.owner_applications enable row level security;
-- No public policies. Inserts happen only through the server action (service role).
-- Admin read policy (adjust to the project's roles table):
create policy "admins read applications"
  on public.owner_applications for select
  using ((select role from public.profiles where id = auth.uid()) = 'admin');
```

Storage: create a **private** bucket `owner-applications` (no public access, no public policies). Admins read files only through short-lived signed URLs generated server-side. File size limit 5MB, allowed MIME types: `image/jpeg`, `image/png`, `image/webp`, `application/pdf`.

## 9. States and behavior

| State | What to show |
|---|---|
| Initial | Empty form. The first field is not auto-focused on mobile. |
| Typing | Validate on blur, then on change after the first error. |
| File chosen | Filled upload row with name, size, thumbnail, Remove, Replace. |
| File error | Red border and message under the row. |
| Submitting | Button spinner and "Submitting…", all inputs disabled, and a progress message such as *"Uploading your files…"*. Prevent double submit. |
| Server error | A red alert at the top of the submit area with the message and the form still filled in (do not clear any field). Files stay selected. |
| Duplicate email | Field error on email: *We already have an open application for this email.* |
| Success | Redirect to `/apply/received`. |

Follow the project's loading indicator rules (`SubmitButton` with `useFormStatus`, `Spinner`, `aria-busy`, `aria-live="polite"`) if they exist. If not, create a small `Spinner` and `SubmitButton`.

Persist the **text fields only** (not files) in `sessionStorage` while the user types, and clear it on success. This protects against accidental refresh. Wrap storage access in try/catch.

## 10. Accessibility

- Every input has a `<label>` linked by `htmlFor`. Errors are linked with `aria-describedby` and use `aria-invalid`.
- The error summary and server error use `role="alert"`.
- All upload rows and the segmented control are reachable and operable with the keyboard.
- Visible focus: 3px outline `#2E9BF0`, 3px offset.
- Rental mode cards are real checkboxes (visually restyled), not clickable divs.
- Color contrast: body text `#51657F` on white is the minimum. Do not use `#8DA0B8` for anything but placeholders and "(optional)".
- Respect `prefers-reduced-motion`.

## 11. Environment variables

```
NEXT_PUBLIC_TURNSTILE_SITE_KEY=
TURNSTILE_SECRET_KEY=
SUPABASE_SERVICE_ROLE_KEY=        # server only (probably already set)
RESEND_API_KEY=                   # probably already set
NEXT_PUBLIC_SITE_URL=             # probably already set
APPLY_COOKIE_SECRET=              # random 32+ chars, signs the apply_email cookie
```

Do not commit real secrets. Add placeholders to `.env.example` if that file exists.

## 12. Acceptance criteria

The task is done when all of these are true:

- [ ] `/apply` renders the full form and matches the layout at 1440px and 390px with no horizontal scroll.
- [ ] Side margins are 140px on desktop and 20px on mobile.
- [ ] The page works with no login.
- [ ] Every required field shows a clear error message when empty or invalid, and focus moves to the first error.
- [ ] At least one rental mode must be chosen, and each chosen mode needs a rate above 0.
- [ ] Upload rows enforce type, 5MB and the photo count (3 to 8) on the client **and** on the server.
- [ ] Submitting twice quickly creates only one application.
- [ ] A second open application for the same email is refused with a friendly message.
- [ ] Turnstile is required, and the action refuses when verification fails.
- [ ] The files are in the **private** bucket and are not reachable by any public URL.
- [ ] No service role key or secret reaches the browser bundle (check the build output).
- [ ] If a file upload fails, no row and no stray files remain.
- [ ] On success the user lands on `/apply/received` and the confirmation email is sent.
- [ ] The navbar, footer and landing page "List your car" links go to `/apply`.
- [ ] `npm run lint` and `npm run build` pass with no new warnings.
- [ ] Keyboard-only use works for the whole form, and screen reader labels are present.

## 13. Do not

- Do not build the admin review screens, approval logic, invite emails or the owner dashboard (separate spec).
- Do not create user accounts in this flow.
- Do not make any file publicly accessible.
- Do not add a new UI kit, state library or CSS framework.
- Do not change unrelated files. Keep the diff focused.

## 14. When you finish

In your final message, list: files created and changed, the migration name, the environment variables the owner must set, how you handled large uploads (section 7.2), and anything you could not complete or had to assume.
