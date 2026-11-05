# Kuyog Bohol

A car rental booking platform for Bohol. Local car owners list their vehicles, customers browse and book directly, and the platform earns a configurable commission on every booking — all managed from one workspace.

The public landing page (`/`) renders without any credentials. Sign-in pages show a setup state until Supabase is configured.

## Tech stack

- **Next.js 16** (App Router) + React 19 + TypeScript
- **Tailwind CSS 4** + shadcn/ui components
- **Supabase** — Postgres, Auth (Email + Google), private Storage buckets
- **Vercel** for hosting

## Roles

| Role | Access |
|---|---|
| **Customer** | Browse cars, book, upload license/ID, view and cancel own bookings |
| **Owner** | Manage vehicles, rates, photos, calendar blocks, bookings, earnings |
| **Admin** | Manage owners, vehicles, customers, bookings, commissions, settings |

Owner and admin accounts are provisioned by an administrator — customers cannot promote themselves.

## Pages

| Route | Purpose |
|---|---|
| `/` | Public landing page |
| `/login`, `/signup` | Authentication |
| `/account` | Customer profile, document upload, My Bookings |
| `/owner` | Owner dashboard: fleet, calendar, bookings, earnings |
| `/admin` | Admin panel: owners, cars, customers, commissions, settings |
| `/owner-setup`, `/admin-setup` | Role onboarding helpers |

## Setup

### 1. Environment

Copy `.env.example` to `.env.local` and set:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`

Restart the dev server after changing environment variables.

### 2. Database

Create a Supabase project and run the migrations **in order** in the SQL Editor:

1. `supabase/migrations/202611030001_customer_portal.sql`
2. `supabase/migrations/202611030002_owner_dashboard.sql`
3. `supabase/migrations/202611030003_admin_panel.sql`
4. `supabase/migrations/202611050001_phase3.sql`
5. `supabase/migrations/202611050002_pricing_rules.sql`
6. `supabase/migrations/202611050003_database_schema.sql`
7. `supabase/migrations/202611050004_security_rls.sql`
8. `supabase/migrations/202611050005_booking_flow.sql`

They create customer, owner, and admin data; booking and calendar rules; private document policies; and platform settings. On a database that already has platform tables, the migrations add missing fields and policies.

### 3. Authentication

In Supabase Authentication settings, enable **Email** and **Google**.

- For Google: add the Supabase callback URL shown in the provider setup to Google Cloud, and add your app's `/auth/callback` URL to Supabase's allowed redirect URLs. For local development this is `http://localhost:3000/auth/callback`.
- Email confirmation redirects to the profile page; Google and existing email sign-ins open My Bookings.

### 4. Provision roles

**Owner** — after creating the account in Supabase Auth, assign the role and create the business row with the user's UUID:

```sql
update public.profiles
set role = 'owner'
where id = 'AUTH-USER-UUID';

insert into public.owners (profile_id, business_name, commission_rate)
values ('AUTH-USER-UUID', 'Rental business name', 0.05);
```

**Admin** — promote the profile after creating the account:

```sql
update public.profiles
set role = 'admin'
where id = 'AUTH-USER-UUID';
```

### 5. Run locally

```bash
npm install
npm run dev
```

Then visit `/signup`.

## Feature notes

- **Documents and images** — customer documents accept PDF, JPG, PNG, or WebP up to 10 MB, are processed by authenticated server routes, and are stored in the private `customer-docs` bucket with per-customer Storage RLS policies. Images are orientation-corrected and converted to WebP; PDFs are preserved. The app never creates public document URLs; admin views use short-lived signed links. Owner car photos are converted server-side into full and thumbnail WebP files in the public `car-photos` bucket.
- **Cancellations** — customers can cancel only their own pending or confirmed bookings before the rental start date. Ownership and status are enforced in Postgres.
- **Owner dashboard** (`/owner`) — vehicle details and photos (public `car-photos` bucket), self-drive and with-driver rates, bookings, multi-vehicle calendar with database-checked manual date blocks, booking status transitions, payment records, and gross/commission/net earnings.
- **Admin panel** (`/admin`) — owner access and commission rates, vehicle availability, customer verification, booking review, monthly per-owner commission reports with CSV download, and default commission/policy text.
- **Phase 3 data foundation** — driver profiles and date schedules, owner or platform promo codes with duration thresholds and usage limits, multiple owner pickup locations with delivery fees, completed-booking reviews, and booking-level snapshots for selected driver, promotion, location, discount, and delivery fee. The existing admin overview provides core booking and revenue analytics.
- **Pricing rules** — one rate per car and rental mode. Owners can set self-drive fuel, mileage, minimum-age, license, and refundable deposit terms, plus with-driver included hours, overtime, fuel/meals/accommodation coverage, and area. Booking requests save pickup location and required itinerary notes for with-driver rentals; self-drive requests require a license document. Prices shown in the browser are estimates; a database trigger calculates the final rate, total, deposit, commission, and owner earnings server-side from saved rates.
- **Booking flow** — requests validate dates and availability on the server, with a database exclusion constraint as the final overlap check. Self-drive requires license and ID documents with verification pending or approved; with-driver requires pickup location, time, and itinerary. Owners see pending request counts, can approve or reject, then record pickup, return, completion, and payment.

## Project structure

```
app/
├─ page.tsx              # public landing page
├─ login/ signup/        # auth
├─ account/              # customer portal
├─ owner/                # owner dashboard
├─ admin/                # admin panel
└─ auth/callback/        # OAuth redirect
components/              # UI, car cards, search, role dashboards
lib/supabase/            # Supabase client helpers
supabase/migrations/     # SQL migrations (run in order)
```

## Deployment

Deploy to Vercel with the same environment variables configured in project settings. Add the production `/auth/callback` URL to Supabase's allowed redirect URLs.
