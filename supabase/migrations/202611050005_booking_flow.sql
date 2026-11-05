-- Require the complete set of customer details for each rental mode and keep
-- request data constrained to fields chosen by the customer.

drop policy if exists "Customers can create own booking requests" on public.bookings;
create policy "Customers can create own booking requests" on public.bookings
  for insert to authenticated with check (
    customer_id = (select auth.uid())
    and exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.role = 'customer')
    and status = 'pending'
    and start_date >= (now() at time zone 'Asia/Manila')::date
    and end_date >= start_date
    and (
      (mode = 'with_driver'
        and nullif(trim(pickup_location), '') is not null
        and pickup_time is not null
        and nullif(trim(itinerary_notes), '') is not null)
      or
      (mode = 'self_drive' and pickup_time is null and exists (
        select 1 from public.profiles p
        where p.id = (select auth.uid())
          and nullif(trim(p.license_path), '') is not null
          and nullif(trim(p.id_path), '') is not null
          and p.verification in ('pending', 'approved')
      ))
    )
  );

grant insert (car_id, customer_id, mode, start_date, end_date, pickup_time, pickup_location, itinerary_notes)
  on public.bookings to authenticated;
