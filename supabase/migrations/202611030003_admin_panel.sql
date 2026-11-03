create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid()) and p.role = 'admin'
  );
$$;

revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to authenticated;

drop policy if exists "Admins can read all profiles" on public.profiles;
create policy "Admins can read all profiles" on public.profiles
  for select to authenticated using (public.is_admin());

drop policy if exists "Admins can update profiles" on public.profiles;
create policy "Admins can update profiles" on public.profiles
  for update to authenticated using (public.is_admin()) with check (public.is_admin());

grant select (license_path, id_path) on public.profiles to authenticated;

drop policy if exists "Admins can manage owners" on public.owners;
create policy "Admins can manage owners" on public.owners
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
grant insert, update, delete on public.owners to authenticated;

drop policy if exists "Admins can manage cars" on public.cars;
create policy "Admins can manage cars" on public.cars
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "Admins can manage car rates" on public.car_rates;
create policy "Admins can manage car rates" on public.car_rates
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "Admins can manage car photos" on public.car_photos;
create policy "Admins can manage car photos" on public.car_photos
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "Admins can manage blocked dates" on public.car_blocked_dates;
create policy "Admins can manage blocked dates" on public.car_blocked_dates
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "Admins can read all bookings" on public.bookings;
create policy "Admins can read all bookings" on public.bookings
  for select to authenticated using (public.is_admin());

drop policy if exists "Admins can read all payments" on public.payments;
create policy "Admins can read all payments" on public.payments
  for select to authenticated using (public.is_admin());

drop policy if exists "Admins can read customer documents" on storage.objects;
create policy "Admins can read customer documents" on storage.objects
  for select to authenticated using (
    bucket_id = 'customer-docs' and public.is_admin()
  );

create table if not exists public.settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id)
);

alter table public.settings enable row level security;

insert into public.settings (key, value)
values
  ('default_commission_rate', '0.05'::jsonb),
  ('rental_policies', to_jsonb(''::text))
on conflict (key) do nothing;

drop policy if exists "Admins can manage platform settings" on public.settings;
create policy "Admins can manage platform settings" on public.settings
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

grant select, insert, update, delete on public.settings to authenticated;

create or replace function public.admin_set_customer_verification(
  customer_uuid uuid,
  next_status public.verification_status
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then raise exception 'Administrator access required.'; end if;
  if next_status not in ('pending', 'approved', 'rejected') then
    raise exception 'Invalid verification status.';
  end if;

  update public.profiles
  set verification = next_status
  where id = customer_uuid and role = 'customer';

  if not found then raise exception 'Customer profile not found.'; end if;
end;
$$;

revoke all on function public.admin_set_customer_verification(uuid, public.verification_status) from public;
grant execute on function public.admin_set_customer_verification(uuid, public.verification_status) to authenticated;

create or replace function public.admin_create_owner(
  customer_uuid uuid,
  new_business_name text,
  new_commission_rate numeric default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_owner_id uuid;
  default_rate numeric;
begin
  if not public.is_admin() then raise exception 'Administrator access required.'; end if;
  if length(trim(coalesce(new_business_name, ''))) = 0 then raise exception 'Business name is required.'; end if;
  if exists (select 1 from public.owners where profile_id = customer_uuid) then
    raise exception 'This user already has an owner business.';
  end if;

  select coalesce((value #>> '{}')::numeric, 0.05) into default_rate
  from public.settings where key = 'default_commission_rate';
  default_rate := coalesce(default_rate, 0.05);

  update public.profiles set role = 'owner'
  where id = customer_uuid and role = 'customer';
  if not found then raise exception 'Customer profile not found or is not eligible for owner access.'; end if;

  insert into public.owners (profile_id, business_name, commission_rate)
  values (customer_uuid, trim(new_business_name), coalesce(new_commission_rate, default_rate))
  returning id into new_owner_id;
  return new_owner_id;
end;
$$;

revoke all on function public.admin_create_owner(uuid, text, numeric) from public;
grant execute on function public.admin_create_owner(uuid, text, numeric) to authenticated;
