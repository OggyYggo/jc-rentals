# Car Rental Platform: Implementation Plan

A public car rental booking website where local car owners list their vehicles and customers book directly. The admin (platform owner) earns a **5% commission on every booking**.

**Stack:** Next.js (App Router) + shadcn/ui + Tailwind CSS, Supabase (Postgres, Auth, Storage), Vercel (hosting, free `*.vercel.app` domain for testing), GitHub (version control).

---

## 1. Business Model

| Item | Rule |
|---|---|
| Platform fee | 5% of the booking total, stored per booking (rate is configurable) |
| Owners | 4 initial partner owners, each with their own cars and dashboard |
| Rental modes | **Self-drive** and **With driver**, each with its own pricing |
| Payment (Phase 1) | Manual: customer pays owner directly, system records it, admin invoices 5% monthly |
| Payment (Phase 2) | Online deposit via PayMongo or Xendit (GCash, Maya, cards), commission auto-deducted |

**Commission formula**

```
commission_amount = total_price * commission_rate   (default 0.05)
owner_earnings    = total_price - commission_amount
```

Always store `total_price`, `commission_rate`, `commission_amount`, and `owner_earnings` on the booking at creation time, so later rate changes never alter old bookings.

---

## 2. User Roles

| Role | Can do |
|---|---|
| **Customer** | Browse cars, book, upload license/ID, view own bookings, cancel per policy |
| **Owner** | Manage own cars, rates, photos, block dates, approve/reject bookings, mark pickup/return, view own earnings |
| **Admin** | Everything: manage owners, all cars and bookings, verify customers, commission reports, payouts, disputes, platform settings |

---

## 3. Feature Scope

### Phase 1: MVP (build first, test with the 4 owners)

**Public**
- Home page with date picker and mode toggle (Self-drive / With driver)
- Car listing page with filters (type, seats, transmission, price, mode)
- Car detail page: photo gallery, specs, rates, policies, availability calendar
- Booking flow with live price breakdown

**Customer**
- Sign up / login (email + Google)
- Profile with license and ID upload (private)
- My bookings (status, details, cancel)

**Owner dashboard**
- My cars: add/edit, photos, enable self-drive and/or with-driver, set rates
- Calendar of bookings and manual date blocking
- Booking requests: approve / reject
- Status updates: picked up, returned, payment received
- Earnings summary (gross, platform fee, net)

**Admin panel**
- Manage owners, cars, customers
- Approve customer verification
- All bookings with filters
- Monthly commission report per owner (exportable CSV)
- Platform settings (default commission rate, policies text)

### Phase 2
- Online deposit payments (PayMongo/Xendit) with automatic commission
- Email/SMS notifications (Resend, Semaphore)
- Pickup and return checklist with photos (damage records)
- Payout tracking per owner

### Phase 3
- Reviews and ratings
- Separate driver profiles and schedules
- Promo codes, weekly/monthly discounts
- Multiple pickup locations, delivery fee
- Analytics dashboard

---

## 4. Pricing Rules

Each car has up to two rate rows (one per mode).

**Self-drive**
- `daily_rate`
- `deposit_amount` (security deposit, refundable)
- Policies: full-to-full fuel, mileage limit, minimum age, license required

**With driver**
- `daily_rate`
- `included_hours` (e.g. 10) and `overtime_per_hour`
- Notes: fuel/driver meals/accommodation included or not, coverage area
- No license needed; requires pickup location and itinerary notes

**Price calculation (server-side only, never trust the client)**

```
days        = number of rental days (min 1)
subtotal    = days * daily_rate
total_price = subtotal            (+ delivery fee, extras later)
deposit     = deposit_amount      (self-drive only, held separately, not part of total)
```

---

## 5. Database Schema (Supabase / Postgres)

Run in the Supabase SQL editor. Adjust names as needed.

```sql
create extension if not exists btree_gist;

-- Enums
create type user_role as enum ('customer', 'owner', 'admin');
create type rental_mode as enum ('self_drive', 'with_driver');
create type booking_status as enum
  ('pending', 'confirmed', 'picked_up', 'returned', 'completed', 'cancelled', 'rejected');
create type verification_status as enum ('none', 'pending', 'approved', 'rejected');
create type payment_status as enum ('unpaid', 'partial', 'paid', 'refunded');

-- Profiles (one per auth user)
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  phone text,
  role user_role not null default 'customer',
  license_path text,          -- private storage path
  id_path text,               -- private storage path
  verification verification_status not null default 'none',
  created_at timestamptz not null default now()
);

-- Owners (business info for users with role = owner)
create table owners (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null unique references profiles(id) on delete cascade,
  business_name text not null,
  contact_phone text,
  gcash_number text,
  commission_rate numeric(5,4) not null default 0.05,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

-- Cars
create table cars (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references owners(id) on delete cascade,
  brand text not null,
  model text not null,
  year int,
  plate_number text,
  car_type text,              -- sedan, suv, van, pickup...
  transmission text,          -- automatic / manual
  fuel_type text,
  seats int,
  description text,
  allows_self_drive boolean not null default true,
  allows_with_driver boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table car_photos (
  id uuid primary key default gen_random_uuid(),
  car_id uuid not null references cars(id) on delete cascade,
  path text not null,         -- storage path (webp)
  thumb_path text,
  sort_order int not null default 0
);

-- One row per mode per car
create table car_rates (
  id uuid primary key default gen_random_uuid(),
  car_id uuid not null references cars(id) on delete cascade,
  mode rental_mode not null,
  daily_rate numeric(10,2) not null check (daily_rate >= 0),
  included_hours int,                       -- with_driver
  overtime_per_hour numeric(10,2),          -- with_driver
  deposit_amount numeric(10,2) default 0,   -- self_drive
  notes text,
  unique (car_id, mode)
);

-- Manual blocks (owner rented it elsewhere, maintenance, etc.)
create table car_blocked_dates (
  id uuid primary key default gen_random_uuid(),
  car_id uuid not null references cars(id) on delete cascade,
  start_date date not null,
  end_date date not null,
  reason text,
  check (end_date >= start_date)
);

-- Bookings
create table bookings (
  id uuid primary key default gen_random_uuid(),
  reference text unique not null,           -- e.g. BK-20261102-1234
  car_id uuid not null references cars(id),
  owner_id uuid not null references owners(id),
  customer_id uuid not null references profiles(id),
  mode rental_mode not null,
  start_date date not null,
  end_date date not null,
  pickup_time time,
  pickup_location text,
  itinerary_notes text,                     -- with_driver
  days int not null,
  daily_rate numeric(10,2) not null,
  total_price numeric(10,2) not null,
  deposit_amount numeric(10,2) default 0,
  commission_rate numeric(5,4) not null,
  commission_amount numeric(10,2) not null,
  owner_earnings numeric(10,2) not null,
  status booking_status not null default 'pending',
  payment payment_status not null default 'unpaid',
  cancel_reason text,
  created_at timestamptz not null default now(),
  check (end_date >= start_date),
  during daterange generated always as (daterange(start_date, end_date, '[]')) stored,
  -- prevents double booking at the database level
  constraint no_double_booking exclude using gist (
    car_id with =, during with &&
  ) where (status in ('pending', 'confirmed', 'picked_up'))
);

-- Payments (manual in Phase 1, gateway in Phase 2)
create table payments (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references bookings(id) on delete cascade,
  amount numeric(10,2) not null,
  method text,                              -- cash, gcash, card
  gateway_ref text,
  paid_at timestamptz not null default now(),
  recorded_by uuid references profiles(id)
);

-- Monthly commission invoices (Phase 1 manual collection)
create table commission_invoices (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references owners(id),
  period_month date not null,               -- first day of month
  total_bookings int not null,
  gross_amount numeric(12,2) not null,
  commission_due numeric(12,2) not null,
  status text not null default 'unpaid',    -- unpaid / paid
  paid_at timestamptz,
  unique (owner_id, period_month)
);

create table settings (
  key text primary key,
  value jsonb not null
);
insert into settings (key, value) values ('default_commission_rate', '0.05');

-- Indexes
create index on cars (owner_id);
create index on bookings (customer_id);
create index on bookings (owner_id, status);
create index on bookings (car_id, start_date, end_date);
```

**Notes**
- The exclusion constraint guarantees two active bookings can never overlap on the same car, even with simultaneous requests.
- Manual blocks live in `car_blocked_dates`. Check them in the booking server action (or a Postgres function) before inserting a booking.
- Create bookings through a **server action or Postgres function** that recalculates price from `car_rates`. Never accept prices from the browser.

---

## 6. Security: Row Level Security (RLS)

Enable RLS on every table. Summary of policies:

| Table | Public | Customer | Owner | Admin |
|---|---|---|---|---|
| `cars`, `car_photos`, `car_rates` | read active | read | write own | all |
| `car_blocked_dates` | read | read | write own | all |
| `bookings` | none | read/insert own | read/update bookings of own cars | all |
| `profiles` | none | read/update own | read customers who booked their cars | all |
| `payments` | none | read own | read/insert for own cars | all |
| `commission_invoices` | none | none | read own | all |

Helper function for role checks:

```sql
create or replace function public.current_role()
returns user_role language sql stable security definer as $$
  select role from profiles where id = auth.uid()
$$;
```

Example policy:

```sql
alter table cars enable row level security;

create policy "public read active cars" on cars
  for select using (is_active = true);

create policy "owners manage own cars" on cars
  for all using (
    owner_id in (select id from owners where profile_id = auth.uid())
  ) with check (
    owner_id in (select id from owners where profile_id = auth.uid())
  );

create policy "admin all cars" on cars
  for all using (public.current_role() = 'admin');
```

Never expose the Supabase **service role key** to the browser. Use it only in server code.

---

## 7. Storage and Image Handling

**Buckets**

| Bucket | Visibility | Contents |
|---|---|---|
| `car-photos` | Public | WebP car images and thumbnails |
| `customer-docs` | **Private** | Driver's license and ID (signed URLs only) |
| `checklists` (Phase 2) | Private | Pickup/return condition photos |

**Upload flow (server-side, converts to WebP)**

```ts
// app/api/upload/car-photo/route.ts
import sharp from "sharp";
import { createClient } from "@/lib/supabase/server";

export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const form = await req.formData();
  const file = form.get("file") as File;
  const carId = form.get("carId") as string;

  if (!file || !file.type.startsWith("image/") || file.size > 10 * 1024 * 1024) {
    return Response.json({ error: "Invalid image (max 10MB)" }, { status: 400 });
  }

  const input = Buffer.from(await file.arrayBuffer());

  const full = await sharp(input)
    .rotate()
    .resize({ width: 1600, withoutEnlargement: true })
    .webp({ quality: 80 })
    .toBuffer();

  const thumb = await sharp(input)
    .rotate()
    .resize({ width: 400, withoutEnlargement: true })
    .webp({ quality: 75 })
    .toBuffer();

  const id = crypto.randomUUID();
  const fullPath = `${carId}/${id}.webp`;
  const thumbPath = `${carId}/${id}-thumb.webp`;

  await supabase.storage.from("car-photos").upload(fullPath, full, { contentType: "image/webp" });
  await supabase.storage.from("car-photos").upload(thumbPath, thumb, { contentType: "image/webp" });

  await supabase.from("car_photos").insert({ car_id: carId, path: fullPath, thumb_path: thumbPath });

  return Response.json({ path: fullPath });
}
```

Use the same pattern for license/ID uploads, but target the private `customer-docs` bucket at quality 90 and serve with short-lived signed URLs (`createSignedUrl`).

Install: `npm i sharp`. In `next.config.ts`, allow your Supabase host in `images.remotePatterns`.

---

## 8. Booking Flow

1. Customer selects dates and mode on the home or listing page.
2. Listing shows only cars **available for those dates** and **enabled for that mode**.
3. Car detail page shows price breakdown and policies.
4. Customer logs in or signs up.
   - Self-drive: must have uploaded license and ID (verification `approved`, or allow `pending` in Phase 1).
   - With driver: pickup location, time, and itinerary notes required.
5. Server action validates dates, availability, and recomputes the price, then inserts the booking as `pending`.
6. Owner is notified, then approves (`confirmed`) or rejects.
7. At pickup the owner marks `picked_up`, and at return `returned`, then `completed` once payment is settled.
8. Commission is counted from `completed` (or `confirmed`, your choice) bookings in the monthly report.

**Availability query (concept)**

```sql
select c.*
from cars c
where c.is_active
  and c.allows_self_drive            -- or allows_with_driver, depending on mode
  and not exists (
    select 1 from bookings b
    where b.car_id = c.id
      and b.status in ('pending','confirmed','picked_up')
      and b.during && daterange(:start, :end, '[]')
  )
  and not exists (
    select 1 from car_blocked_dates d
    where d.car_id = c.id
      and daterange(d.start_date, d.end_date, '[]') && daterange(:start, :end, '[]')
  );
```

---

## 9. Project Structure

```
/
├─ app/
│  ├─ (public)/
│  │  ├─ page.tsx                    # home + search
│  │  ├─ cars/page.tsx               # listing
│  │  ├─ cars/[id]/page.tsx          # detail + booking form
│  │  ├─ terms/page.tsx
│  │  └─ policies/page.tsx
│  ├─ (auth)/
│  │  ├─ login/page.tsx
│  │  └─ signup/page.tsx
│  ├─ account/
│  │  ├─ page.tsx                    # profile + document upload
│  │  └─ bookings/page.tsx
│  ├─ owner/
│  │  ├─ page.tsx                    # overview + earnings
│  │  ├─ cars/page.tsx
│  │  ├─ cars/new/page.tsx
│  │  ├─ cars/[id]/page.tsx
│  │  ├─ bookings/page.tsx
│  │  └─ calendar/page.tsx
│  ├─ admin/
│  │  ├─ page.tsx
│  │  ├─ owners/page.tsx
│  │  ├─ cars/page.tsx
│  │  ├─ bookings/page.tsx
│  │  ├─ customers/page.tsx          # verification queue
│  │  ├─ commissions/page.tsx
│  │  └─ settings/page.tsx
│  └─ api/upload/...
├─ components/
│  ├─ ui/                            # shadcn components
│  ├─ cars/ (car-card, car-gallery, filters)
│  ├─ booking/ (date-picker, mode-toggle, price-summary, booking-form)
│  └─ dashboard/ (stat-card, data-table, calendar)
├─ lib/
│  ├─ supabase/ (client.ts, server.ts, middleware.ts)
│  ├─ pricing.ts                     # price + commission calculation
│  ├─ availability.ts
│  └─ utils.ts
├─ actions/                          # server actions (createBooking, updateStatus...)
├─ middleware.ts                     # session refresh + role-based route protection
└─ types/
```

**shadcn components to install**

```bash
npx shadcn@latest add button card input label select textarea calendar popover \
  dialog sheet tabs table badge dropdown-menu form toast sonner avatar \
  separator skeleton switch checkbox radio-group alert alert-dialog pagination
```

---

## 10. Setup Guide

**1. Create the project**

```bash
npx create-next-app@latest car-rental --typescript --tailwind --eslint --app
cd car-rental
npx shadcn@latest init
npm i @supabase/supabase-js @supabase/ssr sharp zod react-hook-form @hookform/resolvers date-fns
```

**2. GitHub**

```bash
git init
git add . && git commit -m "Initial commit"
# create an empty repo on GitHub, then:
git remote add origin https://github.com/<username>/car-rental.git
git branch -M main
git push -u origin main
```

Use branches (`feature/booking-flow`) and pull requests into `main`. Keep `.env.local` out of Git (it is ignored by default).

**3. Supabase**
- Create a project, then run the SQL from section 5 and the policies from section 6.
- Create the storage buckets (section 7).
- Enable Email and Google auth in Authentication, and add the Vercel URL to the redirect URLs.
- Create a trigger to auto-create a `profiles` row on signup.

```sql
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', ''));
  return new;
end; $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
```

- Manually set your own profile's `role` to `admin`, and each partner's to `owner` (and add their `owners` row).

**4. Environment variables** (`.env.local`, and the same in Vercel project settings)

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=        # server only, never prefix with NEXT_PUBLIC
NEXT_PUBLIC_SITE_URL=
# Phase 2
PAYMONGO_SECRET_KEY=
PAYMONGO_WEBHOOK_SECRET=
```

**5. Vercel**
- Import the GitHub repo into Vercel, add the env variables, and deploy.
- You get a free `your-project.vercel.app` domain for testing. Every push to `main` redeploys, and pull requests get preview URLs.
- Later, buy a custom domain and attach it in Vercel settings.

---

## 11. Roadmap Checklist

**Phase 1 (MVP)**
- [ ] Project setup, GitHub, Vercel, Supabase connected
- [ ] Auth, profiles, role-based route protection (middleware)
- [ ] Database schema and RLS policies
- [ ] Owner: add/edit car, rates, photo upload (WebP)
- [ ] Public listing, filters, car detail page
- [ ] Availability calendar and date blocking
- [ ] Booking flow (both modes) with server-side pricing
- [ ] Customer document upload (private) and admin verification
- [ ] Owner booking approval and status updates
- [ ] Admin dashboard and monthly commission report (CSV)
- [ ] Terms, cancellation, and rental policy pages
- [ ] Test with the 4 owners using real cars and bookings

**Phase 2**
- [ ] PayMongo/Xendit deposit and webhook handling
- [ ] Automatic commission and payout tracking
- [ ] Email/SMS notifications
- [ ] Pickup and return checklist with photos

**Phase 3**
- [ ] Reviews and ratings
- [ ] Driver profiles and scheduling
- [ ] Promo codes, discounts, delivery fees
- [ ] Analytics

---

## 12. Before Going Public (non-code checklist)

- [ ] Written agreement with each owner: 5% fee, when it is paid, what happens if they leave
- [ ] Confirm each owner's insurance covers paid rentals (many policies exclude commercial use)
- [ ] Check LTFRB, LGU, and business registration requirements for rental services in your area (consult a lawyer)
- [ ] Privacy notice for stored IDs and licenses (Data Privacy Act of 2012)
- [ ] Clear terms: deposit, cancellation, late return, fuel, damage, accident procedure
- [ ] Facebook page, Google Business profile, and good photos of each car
- [ ] Partnerships with hotels and tour operators for with-driver bookings

---

## 13. Tips for Building With an AI Coding Assistant

Build one vertical slice at a time and test after each:
1. Auth + roles
2. Car CRUD + photo upload
3. Listing + detail page
4. Availability + booking creation
5. Owner approval flow
6. Admin reports

Give the assistant this file as context, and ask for one slice at a time (for example: "Implement section 7 and the owner add-car page").
