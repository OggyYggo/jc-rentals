create table if not exists public.owner_applications (
  id uuid primary key default gen_random_uuid(),
  full_name text not null check (char_length(trim(full_name)) between 2 and 120),
  business_name text not null check (char_length(trim(business_name)) between 2 and 120),
  email text not null check (char_length(trim(email)) between 3 and 254),
  phone text not null check (char_length(trim(phone)) between 7 and 30),
  car_make text not null check (char_length(trim(car_make)) between 2 and 80),
  car_model text not null check (char_length(trim(car_model)) between 1 and 80),
  car_year integer check (car_year is null or car_year between 1900 and 2100),
  message text not null default '' check (char_length(message) <= 2000),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references public.profiles(id)
);

alter table public.owner_applications enable row level security;

grant insert (full_name, business_name, email, phone, car_make, car_model, car_year, message)
  on public.owner_applications to anon, authenticated;
grant select on public.owner_applications to authenticated;
grant update (status, reviewed_at, reviewed_by) on public.owner_applications to authenticated;

create policy "Anyone can submit owner applications"
  on public.owner_applications for insert to anon, authenticated
  with check (status = 'pending' and reviewed_at is null and reviewed_by is null);

create policy "Admins can review owner applications"
  on public.owner_applications for select to authenticated
  using (public.is_admin());

create policy "Admins can update owner application status"
  on public.owner_applications for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());
