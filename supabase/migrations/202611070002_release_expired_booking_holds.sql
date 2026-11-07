-- Expire overdue payment holds before checking a new booking against the
-- no-double-booking exclusion constraint. This keeps availability correct even
-- when pg_cron is not enabled for the project.
create or replace function public.expire_booking_holds_before_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.expire_unpaid_bookings();
  return new;
end;
$$;

drop trigger if exists expire_booking_holds_before_insert on public.bookings;
create trigger expire_booking_holds_before_insert
before insert on public.bookings
for each row execute function public.expire_booking_holds_before_insert();

-- Payment holds stop appearing as unavailable as soon as their deadline passes,
-- even if the scheduled expiry job has not run yet.
create or replace view public.public_car_booking_dates
with (security_barrier = true)
as
select b.car_id, b.start_date, b.end_date
from public.bookings b
join public.cars c on c.id = b.car_id and c.is_active
where b.status in ('confirmed', 'picked_up')
   or (b.status in ('awaiting_payment', 'payment_review') and b.payment_due_at > now());

grant select on public.public_car_booking_dates to anon, authenticated;
