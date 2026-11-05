-- Bring the deployed schema in line with section 5 of the platform plan.
-- This migration is safe to apply after the existing numbered migrations.

create extension if not exists btree_gist;

do $$ begin
  create type public.payment_status as enum ('unpaid', 'partial', 'paid', 'refunded');
exception when duplicate_object then null; end $$;

alter table public.owners
  add column if not exists gcash_number text;

alter table public.car_photos
  add column if not exists thumb_path text;

alter table public.payments
  add column if not exists gateway_ref text;

create table if not exists public.commission_invoices (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.owners(id) on delete cascade,
  period_month date not null,
  total_bookings integer not null default 0 check (total_bookings >= 0),
  gross_amount numeric(12,2) not null default 0 check (gross_amount >= 0),
  commission_due numeric(12,2) not null default 0 check (commission_due >= 0),
  status text not null default 'unpaid' check (status in ('unpaid', 'paid')),
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  constraint commission_invoices_owner_month_unique unique (owner_id, period_month),
  constraint commission_invoice_month_start check (extract(day from period_month) = 1)
);

alter table public.commission_invoices enable row level security;
drop policy if exists "Owners can read own commission invoices" on public.commission_invoices;
create policy "Owners can read own commission invoices" on public.commission_invoices
  for select to authenticated using (
    owner_id in (select o.id from public.owners o where o.profile_id = (select auth.uid()))
  );
drop policy if exists "Admins can manage commission invoices" on public.commission_invoices;
create policy "Admins can manage commission invoices" on public.commission_invoices
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
grant select, insert, update, delete on public.commission_invoices to authenticated;

-- Keep a stored day count for reporting and use the same minimum-one-day rule
-- as the authoritative price calculation.
alter table public.bookings add column if not exists days integer;
update public.bookings
set days = greatest(1, end_date - start_date)
where days is null;
alter table public.bookings alter column days set default 1;
alter table public.bookings alter column days set not null;

alter table public.bookings
  add column if not exists during daterange
  generated always as (daterange(start_date, end_date, '[]')) stored;

-- Convert existing string payment states only when all values are recognized.
do $$ begin
  if exists (
    select 1 from public.bookings
    where payment not in ('unpaid', 'partial', 'paid', 'refunded')
  ) then
    raise exception 'Cannot convert bookings.payment: found a value outside unpaid, partial, paid, refunded.';
  end if;
end $$;

alter table public.bookings alter column payment drop default;
alter table public.bookings alter column payment type public.payment_status
  using payment::text::public.payment_status;
alter table public.bookings alter column payment set default 'unpaid'::public.payment_status;

-- Prevent concurrent customer requests from reserving the same car and dates.
do $$ begin
  if exists (
    select 1
    from public.bookings a
    join public.bookings b on b.car_id = a.car_id and b.id > a.id
      and b.status in ('pending', 'confirmed', 'picked_up')
      and a.during && b.during
    where a.status in ('pending', 'confirmed', 'picked_up')
  ) then
    raise exception 'Cannot add no_double_booking: existing active bookings overlap. Resolve overlapping bookings, then rerun this migration.';
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.bookings'::regclass and conname = 'no_double_booking'
  ) then
    alter table public.bookings
      add constraint no_double_booking exclude using gist (
        car_id with =,
        during with &&
      ) where (status in ('pending', 'confirmed', 'picked_up'));
  end if;
end $$;

create index if not exists commission_invoices_owner_month_idx
  on public.commission_invoices(owner_id, period_month desc);

-- Recreate the booking trigger so every insert snapshots the server-side day
-- count and price from the saved rate, regardless of values sent by a client.
create or replace function public.set_booking_owner_and_earnings()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  booking_rate numeric(10,2);
  booking_deposit numeric(10,2);
  booking_commission numeric(5,4);
begin
  select c.owner_id, o.commission_rate, r.daily_rate, r.deposit_amount
  into new.owner_id, booking_commission, booking_rate, booking_deposit
  from public.cars c
  join public.owners o on o.id = c.owner_id and o.is_active = true
  join public.car_rates r on r.car_id = c.id and r.mode = new.mode
  where c.id = new.car_id and c.is_active = true
    and ((new.mode = 'self_drive' and c.allows_self_drive)
      or (new.mode = 'with_driver' and c.allows_with_driver));

  if not found then raise exception 'This car is unavailable for the selected rental mode.'; end if;
  if new.end_date < new.start_date then raise exception 'End date must be on or after start date.'; end if;

  if exists (
    select 1 from public.car_blocked_dates d
    where d.car_id = new.car_id
      and daterange(d.start_date, d.end_date, '[]') && daterange(new.start_date, new.end_date, '[]')
  ) then raise exception 'This car is blocked for one or more selected dates.'; end if;

  new.days := greatest(1, new.end_date - new.start_date);
  new.daily_rate := booking_rate;
  new.total_price := booking_rate * new.days;
  new.deposit_amount := case when new.mode = 'self_drive' then booking_deposit else 0 end;
  new.commission_rate := booking_commission;
  new.commission_amount := round(new.total_price * booking_commission, 2);
  new.owner_earnings := new.total_price - new.commission_amount;
  return new;
end;
$$;

comment on function public.set_booking_owner_and_earnings() is
  'Authoritative server-side booking price calculation. Never accept rate, total, deposit, commission, or owner earnings from the client.';
