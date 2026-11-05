-- Section 6 security hardening. Keep customer, financial, and driver contact
-- details behind RLS; expose only the fields needed for public availability.

alter table public.profiles enable row level security;
alter table public.owners enable row level security;
alter table public.cars enable row level security;
alter table public.car_photos enable row level security;
alter table public.car_rates enable row level security;
alter table public.car_blocked_dates enable row level security;
alter table public.bookings enable row level security;
alter table public.payments enable row level security;
alter table public.settings enable row level security;
alter table public.drivers enable row level security;
alter table public.driver_schedules enable row level security;
alter table public.promo_codes enable row level security;
alter table public.pickup_locations enable row level security;
alter table public.reviews enable row level security;
alter table public.commission_invoices enable row level security;

-- Keep driver phone numbers and internal schedule notes private. Public pages
-- can use these narrow views instead of querying the underlying tables.
drop policy if exists "Anyone can read active drivers" on public.drivers;
drop policy if exists "Admins can manage drivers" on public.drivers;
drop policy if exists "Owners can read own drivers" on public.drivers;
create policy "Owners can read own drivers" on public.drivers for select to authenticated
  using (owner_id in (select o.id from public.owners o where o.profile_id = (select auth.uid())));
create policy "Admins can manage drivers" on public.drivers for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists "Anyone can read driver availability" on public.driver_schedules;
drop policy if exists "Admins can manage driver schedules" on public.driver_schedules;
create policy "Admins can manage driver schedules" on public.driver_schedules for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

revoke select on public.drivers, public.driver_schedules from anon;
create or replace view public.public_driver_profiles
with (security_barrier = true)
as
select d.id, d.owner_id, d.full_name, d.bio, d.photo_url
from public.drivers d
join public.owners o on o.id = d.owner_id
where d.is_active and o.is_active;
create or replace view public.public_driver_availability
with (security_barrier = true)
as
select s.driver_id, s.start_date, s.end_date, s.is_available
from public.driver_schedules s
join public.drivers d on d.id = s.driver_id and d.is_active
join public.owners o on o.id = d.owner_id and o.is_active;
grant select on public.public_driver_profiles, public.public_driver_availability to anon, authenticated;

-- Promo codes are secrets customers present for validation; never list them
-- through the public Supabase API.
drop policy if exists "Anyone can read active promo codes" on public.promo_codes;
drop policy if exists "Admins can manage promo codes" on public.promo_codes;
create policy "Admins can manage promo codes" on public.promo_codes for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
revoke select on public.promo_codes from anon;

drop policy if exists "Admins can manage pickup locations" on public.pickup_locations;
create policy "Admins can manage pickup locations" on public.pickup_locations for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists "Admins can manage reviews" on public.reviews;
create policy "Admins can manage reviews" on public.reviews for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
drop policy if exists "Customers can review own completed bookings" on public.reviews;
create policy "Customers can review own completed bookings" on public.reviews for insert to authenticated
  with check (
    customer_id = (select auth.uid())
    and exists (
      select 1 from public.bookings b
      where b.id = reviews.booking_id
        and b.customer_id = (select auth.uid())
        and b.status = 'completed'
        and b.car_id = reviews.car_id
        and b.owner_id = reviews.owner_id
    )
  );
grant update, delete on public.reviews to authenticated;

-- Anonymous availability lookups receive dates only, never customer or payment
-- fields from bookings and never internal reasons for manual blocks.
create or replace view public.public_car_blocked_dates
with (security_barrier = true)
as
select d.car_id, d.start_date, d.end_date
from public.car_blocked_dates d
join public.cars c on c.id = d.car_id and c.is_active;
create or replace view public.public_car_booking_dates
with (security_barrier = true)
as
select b.car_id, b.start_date, b.end_date
from public.bookings b
join public.cars c on c.id = b.car_id and c.is_active
where b.status in ('pending', 'confirmed', 'picked_up');
grant select on public.public_car_blocked_dates, public.public_car_booking_dates to anon, authenticated;

-- Customers can review their own bookings; owners can view bookings for their
-- fleet; admins retain full access. No public booking access is granted.
drop policy if exists "Admins can manage owners" on public.owners;
create policy "Admins can manage owners" on public.owners for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
