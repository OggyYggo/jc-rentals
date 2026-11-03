create extension if not exists pgcrypto;

do $$ begin
  create type public.user_role as enum ('customer', 'owner', 'admin');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.rental_mode as enum ('self_drive', 'with_driver');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.booking_status as enum ('pending', 'confirmed', 'picked_up', 'returned', 'completed', 'cancelled', 'rejected');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.verification_status as enum ('none', 'pending', 'approved', 'rejected');
exception when duplicate_object then null; end $$;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '',
  phone text,
  role public.user_role not null default 'customer',
  license_path text,
  id_path text,
  verification public.verification_status not null default 'none',
  created_at timestamptz not null default now()
);

create table if not exists public.cars (
  id uuid primary key default gen_random_uuid(),
  brand text not null,
  model text not null,
  year int,
  car_type text,
  image_url text,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.bookings (
  id uuid primary key default gen_random_uuid(),
  reference text unique not null default ('BK-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10))),
  car_id uuid not null references public.cars(id),
  customer_id uuid not null references public.profiles(id) on delete cascade,
  mode public.rental_mode not null,
  start_date date not null,
  end_date date not null,
  daily_rate numeric(10,2) not null,
  total_price numeric(10,2) not null,
  deposit_amount numeric(10,2) not null default 0,
  status public.booking_status not null default 'pending',
  payment text not null default 'unpaid',
  cancel_reason text,
  created_at timestamptz not null default now(),
  constraint booking_dates_valid check (end_date >= start_date)
);

create index if not exists bookings_customer_start_idx
  on public.bookings (customer_id, start_date desc);

alter table public.profiles enable row level security;
alter table public.cars enable row level security;
alter table public.bookings enable row level security;

drop policy if exists "Customers can read own profile" on public.profiles;
create policy "Customers can read own profile" on public.profiles
  for select to authenticated using (id = (select auth.uid()));

drop policy if exists "Customers can update own profile" on public.profiles;
create policy "Customers can update own profile" on public.profiles
  for update to authenticated using (id = (select auth.uid()))
  with check (id = (select auth.uid()) and role = 'customer');

revoke update on public.profiles from anon, authenticated;
grant update (full_name, phone, license_path, id_path) on public.profiles to authenticated;
grant select on public.profiles, public.cars, public.bookings to authenticated;
grant select on public.cars to anon;

drop policy if exists "Anyone can read active cars" on public.cars;
create policy "Anyone can read active cars" on public.cars
  for select using (is_active = true);

drop policy if exists "Customers can read cars in own bookings" on public.cars;
create policy "Customers can read cars in own bookings" on public.cars
  for select to authenticated using (
    is_active = true or exists (
      select 1 from public.bookings b
      where b.car_id = cars.id and b.customer_id = (select auth.uid())
    )
  );

drop policy if exists "Customers can read own bookings" on public.bookings;
create policy "Customers can read own bookings" on public.bookings
  for select to authenticated using (customer_id = (select auth.uid()));

create or replace function public.create_customer_profile()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', ''))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created_customer_profile on auth.users;
create trigger on_auth_user_created_customer_profile
  after insert on auth.users
  for each row execute procedure public.create_customer_profile();

insert into public.profiles (id, full_name)
select u.id, coalesce(u.raw_user_meta_data ->> 'full_name', u.raw_user_meta_data ->> 'name', '')
from auth.users u
on conflict (id) do nothing;

create or replace function public.mark_customer_documents_pending()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (new.license_path is distinct from old.license_path or new.id_path is distinct from old.id_path)
    and old.verification <> 'approved' then
    new.verification := 'pending';
  end if;
  return new;
end;
$$;

drop trigger if exists on_customer_documents_updated on public.profiles;
create trigger on_customer_documents_updated
  before update of license_path, id_path on public.profiles
  for each row execute procedure public.mark_customer_documents_pending();

create or replace function public.cancel_my_booking(booking_uuid uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.bookings
  set status = 'cancelled', cancel_reason = 'Cancelled by customer'
  where id = booking_uuid
    and customer_id = (select auth.uid())
    and status in ('pending', 'confirmed')
    and start_date > (now() at time zone 'Asia/Manila')::date;

  if not found then
    raise exception 'This booking cannot be cancelled. Only upcoming pending or confirmed bookings can be cancelled.';
  end if;
end;
$$;

revoke all on function public.cancel_my_booking(uuid) from public;
grant execute on function public.cancel_my_booking(uuid) to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('customer-docs', 'customer-docs', false, 10485760, array['image/jpeg', 'image/png', 'image/webp', 'application/pdf'])
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Customers can read own documents" on storage.objects;
create policy "Customers can read own documents" on storage.objects
  for select to authenticated using (
    bucket_id = 'customer-docs'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists "Customers can upload own documents" on storage.objects;
create policy "Customers can upload own documents" on storage.objects
  for insert to authenticated with check (
    bucket_id = 'customer-docs'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and (storage.foldername(name))[2] in ('license', 'id')
  );

drop policy if exists "Customers can replace own documents" on storage.objects;
create policy "Customers can replace own documents" on storage.objects
  for update to authenticated using (
    bucket_id = 'customer-docs'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  ) with check (
    bucket_id = 'customer-docs'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and (storage.foldername(name))[2] in ('license', 'id')
  );

drop policy if exists "Customers can delete own documents" on storage.objects;
create policy "Customers can delete own documents" on storage.objects
  for delete to authenticated using (
    bucket_id = 'customer-docs'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
