-- Customers must have uploaded both identity documents and be approved
-- before they can create a booking, regardless of rental mode.
drop policy if exists "Customers can create own booking requests" on public.bookings;
create policy "Customers can create own booking requests" on public.bookings
  for insert to authenticated with check (
    customer_id = (select auth.uid())
    and exists (
      select 1
      from public.profiles p
      where p.id = (select auth.uid())
        and p.role = 'customer'
        and p.verification = 'approved'
        and nullif(trim(p.license_path), '') is not null
        and nullif(trim(p.id_path), '') is not null
    )
    and status = 'awaiting_payment'
    and start_date >= (now() at time zone 'Asia/Manila')::date
    and end_date >= start_date
    and (
      (mode = 'with_driver'
        and nullif(trim(pickup_location), '') is not null
        and pickup_time is not null
        and nullif(trim(itinerary_notes), '') is not null)
      or (mode = 'self_drive' and pickup_time is null)
    )
  );
