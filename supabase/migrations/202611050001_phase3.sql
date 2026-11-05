-- Phase 3 marketplace capabilities: driver profiles and availability, promotions,
-- pickup locations, reviews, and booking price snapshots.

create table if not exists public.drivers (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.owners(id) on delete cascade,
  full_name text not null,
  phone text,
  bio text,
  photo_url text,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.driver_schedules (
  id uuid primary key default gen_random_uuid(),
  driver_id uuid not null references public.drivers(id) on delete cascade,
  start_date date not null,
  end_date date not null,
  is_available boolean not null default false,
  note text,
  constraint driver_schedule_dates_valid check (end_date >= start_date)
);

create table if not exists public.promo_codes (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references public.owners(id) on delete cascade,
  code text not null,
  discount_type text not null check (discount_type in ('percentage', 'fixed')),
  discount_value numeric(10,2) not null check (discount_value > 0),
  min_days integer not null default 1 check (min_days > 0),
  starts_at timestamptz,
  ends_at timestamptz,
  max_uses integer check (max_uses is null or max_uses > 0),
  uses_count integer not null default 0 check (uses_count >= 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  constraint promo_code_owner_unique unique (owner_id, code),
  constraint promo_dates_valid check (ends_at is null or starts_at is null or ends_at > starts_at)
);

create table if not exists public.pickup_locations (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.owners(id) on delete cascade,
  name text not null,
  address text not null,
  delivery_fee numeric(10,2) not null default 0 check (delivery_fee >= 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  constraint pickup_location_name_unique unique (owner_id, name)
);

create table if not exists public.reviews (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null unique references public.bookings(id) on delete cascade,
  customer_id uuid not null references public.profiles(id) on delete cascade,
  car_id uuid not null references public.cars(id) on delete cascade,
  owner_id uuid not null references public.owners(id) on delete cascade,
  rating smallint not null check (rating between 1 and 5),
  comment text,
  created_at timestamptz not null default now()
);

alter table public.bookings
  add column if not exists driver_id uuid references public.drivers(id) on delete set null,
  add column if not exists promo_code_id uuid references public.promo_codes(id) on delete set null,
  add column if not exists promo_discount numeric(10,2) not null default 0 check (promo_discount >= 0),
  add column if not exists pickup_location_id uuid references public.pickup_locations(id) on delete set null,
  add column if not exists delivery_fee numeric(10,2) not null default 0 check (delivery_fee >= 0);

create index if not exists drivers_owner_idx on public.drivers(owner_id);
create index if not exists driver_schedules_dates_idx on public.driver_schedules(driver_id, start_date, end_date);
create index if not exists pickup_locations_owner_idx on public.pickup_locations(owner_id);
create index if not exists reviews_car_created_idx on public.reviews(car_id, created_at desc);
create index if not exists bookings_promo_idx on public.bookings(promo_code_id) where promo_code_id is not null;

alter table public.drivers enable row level security;
alter table public.driver_schedules enable row level security;
alter table public.promo_codes enable row level security;
alter table public.pickup_locations enable row level security;
alter table public.reviews enable row level security;

drop policy if exists "Owners manage own drivers" on public.drivers;
create policy "Owners manage own drivers" on public.drivers for all to authenticated
  using (owner_id in (select id from public.owners where profile_id = (select auth.uid())))
  with check (owner_id in (select id from public.owners where profile_id = (select auth.uid())));
drop policy if exists "Anyone can read active drivers" on public.drivers;
create policy "Anyone can read active drivers" on public.drivers for select
  using (is_active and owner_id in (select id from public.owners where is_active = true));

drop policy if exists "Owners manage own driver schedules" on public.driver_schedules;
create policy "Owners manage own driver schedules" on public.driver_schedules for all to authenticated
  using (driver_id in (select id from public.drivers where owner_id in (select id from public.owners where profile_id = (select auth.uid()))))
  with check (driver_id in (select id from public.drivers where owner_id in (select id from public.owners where profile_id = (select auth.uid()))));
drop policy if exists "Anyone can read driver availability" on public.driver_schedules;
create policy "Anyone can read driver availability" on public.driver_schedules for select
  using (driver_id in (select id from public.drivers where is_active));

drop policy if exists "Owners manage own promo codes" on public.promo_codes;
create policy "Owners manage own promo codes" on public.promo_codes for all to authenticated
  using (owner_id in (select id from public.owners where profile_id = (select auth.uid())))
  with check (owner_id in (select id from public.owners where profile_id = (select auth.uid())));
drop policy if exists "Anyone can read active promo codes" on public.promo_codes;
create policy "Anyone can read active promo codes" on public.promo_codes for select
  using (is_active and (owner_id is null or owner_id in (select id from public.owners where is_active = true)));

drop policy if exists "Owners manage own pickup locations" on public.pickup_locations;
create policy "Owners manage own pickup locations" on public.pickup_locations for all to authenticated
  using (owner_id in (select id from public.owners where profile_id = (select auth.uid())))
  with check (owner_id in (select id from public.owners where profile_id = (select auth.uid())));
drop policy if exists "Anyone can read active pickup locations" on public.pickup_locations;
create policy "Anyone can read active pickup locations" on public.pickup_locations for select
  using (is_active and owner_id in (select id from public.owners where is_active = true));

drop policy if exists "Customers can read reviews" on public.reviews;
create policy "Customers can read reviews" on public.reviews for select using (true);
drop policy if exists "Customers can review own completed bookings" on public.reviews;
create policy "Customers can review own completed bookings" on public.reviews for insert to authenticated
  with check (
    customer_id = (select auth.uid())
    and exists (select 1 from public.bookings b where b.id = booking_id and b.customer_id = (select auth.uid()) and b.status = 'completed' and b.car_id = car_id and b.owner_id = owner_id)
  );

grant select on public.drivers, public.driver_schedules, public.promo_codes, public.pickup_locations, public.reviews to anon, authenticated;
grant insert, update, delete on public.drivers, public.driver_schedules, public.promo_codes, public.pickup_locations to authenticated;
grant insert on public.reviews to authenticated;

