alter table public.bookings
  add column cancellation_policy_version text,
  add column cancellation_policy_accepted_at timestamptz,
  add constraint booking_policy_acceptance_pair check (
    (cancellation_policy_version is null) = (cancellation_policy_accepted_at is null)
  );

-- Customers create new bookings through the authenticated server action.
-- Existing bookings without an acceptance record remain readable.
revoke insert on public.bookings from public, anon, authenticated;
revoke insert (car_id,customer_id,mode,start_date,end_date,pickup_time,pickup_location,itinerary_notes,
  ref_owner_id,ref_car_id,ref_src,cancellation_policy_version,cancellation_policy_accepted_at)
  on public.bookings from public, anon, authenticated;
grant insert (cancellation_policy_version,cancellation_policy_accepted_at)
  on public.bookings to service_role;

create function public.create_policy_accepted_booking(
  p_customer_id uuid,p_car_id uuid,p_mode public.rental_mode,p_start date,p_end date,
  p_pickup_time time,p_pickup_location text,p_itinerary text,p_version text,
  p_ref_owner_id uuid,p_ref_car_id uuid,p_ref_src text
)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  booking_id uuid;
  previous_subject text := current_setting('request.jwt.claim.sub',true);
  previous_claims text := current_setting('request.jwt.claims',true);
begin
  if p_version is distinct from '2026-11-21' then raise exception 'BOOKING_POLICY_REQUIRED'; end if;
  if p_start is null or p_end is null or p_start < (now() at time zone 'Asia/Manila')::date
     or p_end <= p_start or p_mode is null then raise exception 'Invalid booking dates.'; end if;
  if (p_mode = 'with_driver' and (p_pickup_time is null or nullif(btrim(p_pickup_location),'') is null
      or nullif(btrim(p_itinerary),'') is null)) or (p_mode = 'self_drive' and p_pickup_time is not null)
  then raise exception 'Invalid pickup details.'; end if;
  perform 1 from public.profiles where id = p_customer_id and role = 'customer'
    and verification = 'approved' and nullif(btrim(license_path),'') is not null and nullif(btrim(id_path),'') is not null
    for share;
  if not found then raise exception 'CUSTOMER_VERIFICATION_REQUIRED'; end if;

  -- Preserve the authenticated customer as the actor for booking audit entries.
  perform set_config('request.jwt.claim.sub',p_customer_id::text,true);
  perform set_config('request.jwt.claims', (coalesce(nullif(previous_claims,'')::jsonb,'{}') || jsonb_build_object('sub',p_customer_id))::text,true);
  insert into public.bookings (customer_id,car_id,mode,start_date,end_date,pickup_time,pickup_location,itinerary_notes,
    cancellation_policy_version,cancellation_policy_accepted_at,ref_owner_id,ref_car_id,ref_src)
  values (p_customer_id,p_car_id,p_mode,p_start,p_end,p_pickup_time,p_pickup_location,p_itinerary,
    p_version,clock_timestamp(),p_ref_owner_id,p_ref_car_id,p_ref_src)
  returning id into booking_id;
  perform set_config('request.jwt.claim.sub',coalesce(previous_subject,''),true);
  perform set_config('request.jwt.claims',coalesce(previous_claims,''),true);
  return booking_id;
end;
$$;
revoke all on function public.create_policy_accepted_booking(uuid,uuid,public.rental_mode,date,date,time,text,text,text,uuid,uuid,text)
  from public, anon, authenticated;
grant execute on function public.create_policy_accepted_booking(uuid,uuid,public.rental_mode,date,date,time,text,text,text,uuid,uuid,text)
  to service_role;
