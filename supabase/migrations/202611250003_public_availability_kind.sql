create or replace view public.public_car_booking_dates with (security_barrier = true) as
select b.car_id,b.start_date,b.end_date,
  case when b.status in ('confirmed','picked_up') then 'booked' else 'held' end as kind
from public.bookings b join public.cars c on c.id = b.car_id and c.is_active
where b.status in ('confirmed','picked_up')
   or (b.status = 'awaiting_payment' and greatest(b.payment_due_at,b.payment_resubmit_due_at) > now())
   or (b.status = 'payment_review' and coalesce(b.review_due_at,b.payment_due_at) > now());
