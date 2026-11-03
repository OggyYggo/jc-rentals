create table if not exists public.owners (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null unique references public.profiles(id) on delete cascade,
  business_name text not null,
  contact_phone text,
  commission_rate numeric(5,4) not null default 0.05 check (commission_rate >= 0 and commission_rate <= 1),
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.cars
  add column if not exists owner_id uuid references public.owners(id) on delete cascade,
  add column if not exists plate_number text,
  add column if not exists transmission text,
  add column if not exists fuel_type text,
  add column if not exists seats int,
  add column if not exists description text,
  add column if not exists allows_self_drive boolean not null default true,
  add column if not exists allows_with_driver boolean not null default false;

alter table public.bookings
  add column if not exists owner_id uuid references public.owners(id),
  add column if not exists commission_rate numeric(5,4) not null default 0.05,
  add column if not exists commission_amount numeric(10,2) not null default 0,
  add column if not exists owner_earnings numeric(10,2) not null default 0,
  add column if not exists pickup_time time,
  add column if not exists pickup_location text;

update public.bookings b
set owner_id = c.owner_id
from public.cars c
where b.car_id = c.id and b.owner_id is null and c.owner_id is not null;

update public.bookings b
set commission_rate = o.commission_rate,
    commission_amount = round(b.total_price * o.commission_rate, 2),
    owner_earnings = b.total_price - round(b.total_price * o.commission_rate, 2)
from public.owners o
where b.owner_id = o.id and b.commission_amount = 0 and b.total_price > 0;

create index if not exists cars_owner_idx on public.cars (owner_id);
create index if not exists bookings_owner_status_idx on public.bookings (owner_id, status);

create table if not exists public.car_rates (
  id uuid primary key default gen_random_uuid(),
  car_id uuid not null references public.cars(id) on delete cascade,
  mode public.rental_mode not null,
  daily_rate numeric(10,2) not null check (daily_rate >= 0),
  included_hours int,
  overtime_per_hour numeric(10,2),
  deposit_amount numeric(10,2) not null default 0,
  notes text,
  unique (car_id, mode)
);

create table if not exists public.car_photos (
  id uuid primary key default gen_random_uuid(),
  car_id uuid not null references public.cars(id) on delete cascade,
  path text not null,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.car_blocked_dates (
  id uuid primary key default gen_random_uuid(),
  car_id uuid not null references public.cars(id) on delete cascade,
  start_date date not null,
  end_date date not null,
  reason text,
  created_at timestamptz not null default now(),
  constraint blocked_dates_valid check (end_date >= start_date)
);

create index if not exists blocked_dates_car_range_idx on public.car_blocked_dates (car_id, start_date, end_date);

create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings(id) on delete cascade,
  amount numeric(10,2) not null,
  method text not null default 'cash',
  paid_at timestamptz not null default now(),
  recorded_by uuid references public.profiles(id)
);

alter table public.owners enable row level security;
alter table public.car_rates enable row level security;
alter table public.car_photos enable row level security;
alter table public.car_blocked_dates enable row level security;
alter table public.payments enable row level security;

drop policy if exists "Owners can read own business" on public.owners;
create policy "Owners can read own business" on public.owners
  for select to authenticated using (profile_id = (select auth.uid()));

drop policy if exists "Owners can read own cars" on public.cars;
create policy "Owners can read own cars" on public.cars
  for select to authenticated using (
    owner_id in (select o.id from public.owners o where o.profile_id = (select auth.uid()))
  );

drop policy if exists "Owners can add own cars" on public.cars;
create policy "Owners can add own cars" on public.cars
  for insert to authenticated with check (
    owner_id in (select o.id from public.owners o where o.profile_id = (select auth.uid()))
  );

drop policy if exists "Owners can edit own cars" on public.cars;
create policy "Owners can edit own cars" on public.cars
  for update to authenticated using (
    owner_id in (select o.id from public.owners o where o.profile_id = (select auth.uid()))
  ) with check (
    owner_id in (select o.id from public.owners o where o.profile_id = (select auth.uid()))
  );

drop policy if exists "Owners can remove own cars" on public.cars;
create policy "Owners can remove own cars" on public.cars
  for delete to authenticated using (
    owner_id in (select o.id from public.owners o where o.profile_id = (select auth.uid()))
  );

drop policy if exists "Owners can manage own car rates" on public.car_rates;
create policy "Owners can manage own car rates" on public.car_rates
  for all to authenticated using (
    car_id in (select c.id from public.cars c join public.owners o on o.id = c.owner_id where o.profile_id = (select auth.uid()))
  ) with check (
    car_id in (select c.id from public.cars c join public.owners o on o.id = c.owner_id where o.profile_id = (select auth.uid()))
  );

drop policy if exists "Anyone can read rates for active cars" on public.car_rates;
create policy "Anyone can read rates for active cars" on public.car_rates
  for select using (car_id in (select c.id from public.cars c where c.is_active = true));

drop policy if exists "Owners can manage own car photos" on public.car_photos;
create policy "Owners can manage own car photos" on public.car_photos
  for all to authenticated using (
    car_id in (select c.id from public.cars c join public.owners o on o.id = c.owner_id where o.profile_id = (select auth.uid()))
  ) with check (
    car_id in (select c.id from public.cars c join public.owners o on o.id = c.owner_id where o.profile_id = (select auth.uid()))
  );

drop policy if exists "Anyone can read photos for active cars" on public.car_photos;
create policy "Anyone can read photos for active cars" on public.car_photos
  for select using (car_id in (select c.id from public.cars c where c.is_active = true));

drop policy if exists "Owners can manage own blocked dates" on public.car_blocked_dates;
create policy "Owners can manage own blocked dates" on public.car_blocked_dates
  for all to authenticated using (
    car_id in (select c.id from public.cars c join public.owners o on o.id = c.owner_id where o.profile_id = (select auth.uid()))
  ) with check (
    car_id in (select c.id from public.cars c join public.owners o on o.id = c.owner_id where o.profile_id = (select auth.uid()))
  );

drop policy if exists "Owners can read own bookings" on public.bookings;
create policy "Owners can read own bookings" on public.bookings
  for select to authenticated using (
    owner_id in (select o.id from public.owners o where o.profile_id = (select auth.uid()))
  );

drop policy if exists "Owners can read customer contact for bookings" on public.profiles;
revoke select on public.profiles from anon, authenticated;
grant select (id, full_name, phone, role, verification, created_at) on public.profiles to authenticated;

create or replace view public.my_customer_document_presence
with (security_barrier = true)
as
select p.id,
       (p.license_path is not null) as has_license,
       (p.id_path is not null) as has_id
from public.profiles p
where p.id = (select auth.uid());

create or replace view public.owner_booking_contacts
with (security_barrier = true)
as
select b.id as booking_id, p.full_name, p.phone
from public.bookings b
join public.profiles p on p.id = b.customer_id
where exists (
  select 1 from public.owners o
  where o.id = b.owner_id and o.profile_id = (select auth.uid()) and o.is_active = true
);

grant select on public.my_customer_document_presence, public.owner_booking_contacts to authenticated;

drop policy if exists "Owners can read payments for own bookings" on public.payments;
create policy "Owners can read payments for own bookings" on public.payments
  for select to authenticated using (
    booking_id in (select b.id from public.bookings b where b.owner_id in (select o.id from public.owners o where o.profile_id = (select auth.uid())))
  );

grant select on public.owners, public.car_rates, public.car_photos, public.car_blocked_dates, public.payments to authenticated;
grant select on public.car_rates, public.car_photos to anon;
grant insert, update, delete on public.cars, public.car_rates, public.car_photos, public.car_blocked_dates to authenticated;
revoke update on public.bookings from anon, authenticated;
revoke insert, update, delete on public.payments from anon, authenticated;

create or replace function public.prevent_booking_date_block_conflict()
returns trigger language plpgsql set search_path = '' as $$
begin
  if exists (
    select 1 from public.bookings b
    where b.car_id = new.car_id
      and b.status in ('pending', 'confirmed', 'picked_up')
      and daterange(b.start_date, b.end_date, '[]') && daterange(new.start_date, new.end_date, '[]')
  ) then
    raise exception 'These dates overlap an active booking.';
  end if;
  return new;
end;
$$;

drop trigger if exists check_blocked_dates_against_bookings on public.car_blocked_dates;
create trigger check_blocked_dates_against_bookings
  before insert or update on public.car_blocked_dates
  for each row execute procedure public.prevent_booking_date_block_conflict();

create or replace function public.set_booking_owner_and_earnings()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  booking_rate numeric(10,2);
  booking_deposit numeric(10,2);
  booking_commission numeric(5,4);
  rental_days integer;
begin
  select c.owner_id, o.commission_rate, r.daily_rate, r.deposit_amount
  into new.owner_id, booking_commission, booking_rate, booking_deposit
  from public.cars c
  join public.owners o on o.id = c.owner_id and o.is_active = true
  join public.car_rates r on r.car_id = c.id and r.mode = new.mode
  where c.id = new.car_id and c.is_active = true
    and ((new.mode = 'self_drive' and c.allows_self_drive) or (new.mode = 'with_driver' and c.allows_with_driver));

  if not found then raise exception 'This car is unavailable for the selected rental mode.'; end if;
  if new.end_date < new.start_date then raise exception 'End date must be on or after start date.'; end if;

  if exists (
    select 1 from public.car_blocked_dates d
    where d.car_id = new.car_id
      and daterange(d.start_date, d.end_date, '[]') && daterange(new.start_date, new.end_date, '[]')
  ) then raise exception 'This car is blocked for one or more selected dates.'; end if;

  rental_days := greatest(1, new.end_date - new.start_date);
  new.daily_rate := booking_rate;
  new.total_price := booking_rate * rental_days;
  new.deposit_amount := case when new.mode = 'self_drive' then booking_deposit else 0 end;
  new.commission_rate := booking_commission;
  new.commission_amount := round(new.total_price * booking_commission, 2);
  new.owner_earnings := new.total_price - new.commission_amount;
  return new;
end;
$$;

drop trigger if exists assign_booking_owner_and_earnings on public.bookings;
create trigger assign_booking_owner_and_earnings
  before insert on public.bookings
  for each row execute procedure public.set_booking_owner_and_earnings();

create or replace function public.owner_set_booking_status(booking_uuid uuid, next_status public.booking_status)
returns void language plpgsql security definer set search_path = '' as $$
declare
  current_status public.booking_status;
begin
  select b.status into current_status
  from public.bookings b
  join public.owners o on o.id = b.owner_id
  where b.id = booking_uuid and o.profile_id = (select auth.uid()) and o.is_active = true
  for update;

  if not found then raise exception 'Booking not found for this owner.'; end if;

  if not (
    (current_status = 'pending' and next_status in ('confirmed', 'rejected')) or
    (current_status = 'confirmed' and next_status = 'picked_up') or
    (current_status = 'picked_up' and next_status = 'returned') or
    (current_status = 'returned' and next_status = 'completed')
  ) then
    raise exception 'This booking status change is not allowed.';
  end if;

  update public.bookings set status = next_status where id = booking_uuid;
end;
$$;

revoke all on function public.owner_set_booking_status(uuid, public.booking_status) from public;
grant execute on function public.owner_set_booking_status(uuid, public.booking_status) to authenticated;

create or replace function public.owner_mark_payment_received(booking_uuid uuid, payment_method text default 'cash')
returns void language plpgsql security definer set search_path = '' as $$
declare
  booking_amount numeric(10,2);
  booking_payment text;
begin
  select b.total_price, b.payment into booking_amount, booking_payment
  from public.bookings b
  join public.owners o on o.id = b.owner_id
  where b.id = booking_uuid
    and o.profile_id = (select auth.uid())
    and o.is_active = true
    and b.status in ('confirmed', 'picked_up', 'returned', 'completed')
  for update of b;

  if not found then raise exception 'Payment cannot be recorded for this booking.'; end if;
  if booking_payment = 'paid' then return; end if;
  if coalesce(payment_method, 'cash') not in ('cash', 'gcash', 'bank_transfer', 'other') then
    raise exception 'Payment method is not supported.';
  end if;

  update public.bookings set payment = 'paid' where id = booking_uuid;
  insert into public.payments (booking_id, amount, method, recorded_by)
  values (booking_uuid, booking_amount, coalesce(nullif(payment_method, ''), 'cash'), (select auth.uid()));
end;
$$;

revoke all on function public.owner_mark_payment_received(uuid, text) from public;
grant execute on function public.owner_mark_payment_received(uuid, text) to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('car-photos', 'car-photos', true, 10485760, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set public = true, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Owners can upload own car photos" on storage.objects;
create policy "Owners can upload own car photos" on storage.objects
  for insert to authenticated with check (
    bucket_id = 'car-photos'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and exists (
      select 1 from public.cars c join public.owners o on o.id = c.owner_id
      where c.id::text = (storage.foldername(name))[2] and o.profile_id = (select auth.uid())
    )
  );

drop policy if exists "Owners can replace own car photos" on storage.objects;
create policy "Owners can replace own car photos" on storage.objects
  for update to authenticated using (
    bucket_id = 'car-photos' and (storage.foldername(name))[1] = (select auth.uid())::text
  ) with check (
    bucket_id = 'car-photos'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and exists (
      select 1 from public.cars c join public.owners o on o.id = c.owner_id
      where c.id::text = (storage.foldername(name))[2] and o.profile_id = (select auth.uid())
    )
  );

drop policy if exists "Owners can delete own car photos" on storage.objects;
create policy "Owners can delete own car photos" on storage.objects
  for delete to authenticated using (
    bucket_id = 'car-photos'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and exists (
      select 1 from public.cars c join public.owners o on o.id = c.owner_id
      where c.id::text = (storage.foldername(name))[2] and o.profile_id = (select auth.uid())
    )
  );
