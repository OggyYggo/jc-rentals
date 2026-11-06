alter table public.cars add column if not exists short_code text;
create unique index if not exists cars_short_code_uidx on public.cars (short_code) where short_code is not null;

do $$
declare
  car_row record;
  candidate text;
begin
  for car_row in select id from public.cars where short_code is null loop
    loop
      select string_agg(substr('abcdefghjkmnpqrstuvwxyz23456789', (get_byte(gen_random_bytes(1), 0) % 31) + 1, 1), '')
        into candidate
        from generate_series(1, 6);
      exit when not exists (select 1 from public.cars where short_code = candidate);
    end loop;
    update public.cars set short_code = candidate where id = car_row.id;
  end loop;
end;
$$;

alter table public.bookings
  add column if not exists ref_owner_id uuid references public.owners(id) on delete set null,
  add column if not exists ref_car_id uuid references public.cars(id) on delete set null,
  add column if not exists ref_src text;
alter table public.bookings drop constraint if exists bookings_ref_src_check;
alter table public.bookings add constraint bookings_ref_src_check
  check (ref_src is null or ref_src in ('post', 'story', 'poster', 'sticker', 'cover', 'share'));
grant insert (car_id, customer_id, mode, start_date, end_date, pickup_location, itinerary_notes, ref_owner_id, ref_car_id, ref_src)
  on public.bookings to authenticated;

create table if not exists public.promo_clicks (
  id uuid primary key default gen_random_uuid(),
  car_id uuid not null references public.cars(id) on delete cascade,
  owner_id uuid not null references public.owners(id) on delete cascade,
  src text not null default 'share',
  clicked_at timestamptz not null default now(),
  constraint promo_clicks_src_check check (src in ('post', 'story', 'poster', 'sticker', 'cover', 'share'))
);
create index if not exists promo_clicks_owner_clicked_idx on public.promo_clicks (owner_id, clicked_at desc);

alter table public.promo_clicks enable row level security;
drop policy if exists "Owners read own promo clicks" on public.promo_clicks;
create policy "Owners read own promo clicks" on public.promo_clicks
  for select to authenticated using (
    owner_id in (select id from public.owners where profile_id = (select auth.uid()))
  );
drop policy if exists "Admins read promo clicks" on public.promo_clicks;
create policy "Admins read promo clicks" on public.promo_clicks
  for select to authenticated using (
    exists (select 1 from public.profiles where id = (select auth.uid()) and role = 'admin')
  );
revoke all on public.promo_clicks from anon, authenticated;
grant select on public.promo_clicks to authenticated;
grant insert on public.promo_clicks to service_role;

