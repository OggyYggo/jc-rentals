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

- **Documents** — profile uploads accept PDF, JPG, PNG, or WebP up to 10 MB, stored in the private `customer-docs` bucket with per-customer Storage RLS policies. The app never creates public document URLs; admin views use short-lived signed links.
- **Cancellations** — customers can cancel only their own pending or confirmed bookings before the rental start date. Ownership and status are enforced in Postgres.
- **Owner dashboard** (`/owner`) — vehicle details and photos (public `car-photos` bucket), self-drive and with-driver rates, bookings, multi-vehicle calendar with database-checked manual date blocks, booking status transitions, payment records, and gross/commission/net earnings.
- **Admin panel** (`/admin`) — owner access and commission rates, vehicle availability, customer verification, booking review, monthly per-owner commission reports with CSV download, and default commission/policy text.

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
