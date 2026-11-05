alter table public.car_rates
  add column if not exists fuel_policy text,
  add column if not exists mileage_limit text,
  add column if not exists minimum_age integer check (minimum_age is null or minimum_age >= 18),
  add column if not exists license_required boolean not null default false,
  add column if not exists fuel_included boolean not null default false,
  add column if not exists driver_meals_included boolean not null default false,
  add column if not exists accommodation_included boolean not null default false,
  add column if not exists coverage_area text;

alter table public.bookings
  add column if not exists itinerary_notes text;

drop policy if exists "Customers can create own booking requests" on public.bookings;
create policy "Customers can create own booking requests" on public.bookings
  for insert to authenticated with check (
    customer_id = (select auth.uid())
    and status = 'pending'
    and start_date >= (now() at time zone 'Asia/Manila')::date
    and end_date >= start_date
    and (mode <> 'with_driver' or (nullif(trim(pickup_location), '') is not null and nullif(trim(itinerary_notes), '') is not null))
    and (mode <> 'self_drive' or exists (
      select 1 from public.profiles p where p.id = (select auth.uid()) and nullif(trim(p.license_path), '') is not null
    ))
  );
grant insert (car_id, customer_id, mode, start_date, end_date, pickup_location, itinerary_notes) on public.bookings to authenticated;

-- Existing self-drive rentals require a license. With-driver rentals do not.
update public.car_rates set license_required = (mode = 'self_drive');

comment on function public.set_booking_owner_and_earnings() is
  'Authoritative server-side booking price calculation. Never accept rate, total, deposit, commission, or owner earnings from the client.';

alter table public.car_rates
  drop constraint if exists car_rate_mode_policy_check;

alter table public.car_rates
  add constraint car_rate_mode_policy_check check (
    (mode = 'self_drive' and (included_hours is null) and (overtime_per_hour is null))
    or mode = 'with_driver'
  );
