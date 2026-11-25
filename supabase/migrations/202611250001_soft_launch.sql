insert into public.settings (key, value) values ('bookings_paused', 'false')
on conflict (key) do nothing;

create function public.bookings_are_paused()
returns boolean language sql stable security definer set search_path = '' as $$
  select not exists (select 1 from public.settings where key = 'bookings_paused' and value = 'false'::jsonb);
$$;
revoke all on function public.bookings_are_paused() from public, anon, authenticated;
grant execute on function public.bookings_are_paused() to anon, authenticated, service_role;

create or replace function public.create_policy_accepted_booking(
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
  -- Keep the pause setting stable until the booking transaction commits.
  perform 1 from public.settings where key = 'bookings_paused' for share;
  if public.bookings_are_paused() then raise exception 'BOOKINGS_PAUSED'; end if;
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

create function public.admin_recover_booking_status(p_booking uuid, p_expected public.booking_status, p_status public.booking_status, p_reason text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  b public.bookings%rowtype;
  previous_reason text := current_setting('app.audit_reason', true);
  reason text := btrim(p_reason);
begin
  if not coalesce(public.is_admin(), false) then
    raise exception 'Administrator access required.' using errcode = '42501';
  end if;
  if reason is null or char_length(reason) not between 3 and 300 or reason !~ '[^[:space:]]' then
    raise exception 'RECOVERY_REASON_REQUIRED';
  end if;
  select * into b from public.bookings where id = p_booking for update;
  if not found or b.status is distinct from p_expected then raise exception 'RECOVERY_STALE_BOOKING'; end if;

  if p_status = 'expired' and b.status in ('pending', 'awaiting_payment')
     and b.payment = 'unpaid' and coalesce(b.amount_paid_online, 0) = 0
     and not exists (select 1 from public.payments where booking_id = b.id)
     and not exists (select 1 from public.booking_refunds where booking_id = b.id) then
    null;
  elsif p_status = 'completed' and b.status = 'returned' and b.payment = 'paid' then
    null;
  else
    raise exception 'RECOVERY_TRANSITION_NOT_ALLOWED';
  end if;

  perform set_config('app.audit_reason', reason, true);
  update public.bookings set status = p_status where id = b.id;
  perform set_config('app.audit_reason', coalesce(previous_reason, ''), true);
end;
$$;
revoke all on function public.admin_recover_booking_status(uuid, public.booking_status, public.booking_status, text) from public, anon, authenticated;
grant execute on function public.admin_recover_booking_status(uuid, public.booking_status, public.booking_status, text) to authenticated;

-- The existing append-only audit log stores timestamped consent and the
-- attempt count. A transaction lock serializes concurrent uploads per customer.
create function public.authorize_customer_document_upload(p_customer uuid, p_kind text, p_policy text)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  if p_kind is null or p_kind not in ('license', 'id', 'selfie')
     or p_policy is distinct from '2026-11-25'
     or not exists (select 1 from public.profiles where id = p_customer and role = 'customer') then
    raise exception 'DOCUMENT_UPLOAD_NOT_AUTHORIZED';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('customer-document-upload:' || p_customer::text, 0));
  if (select count(*) from public.audit_log
      where entity_type = 'customer' and entity_id = p_customer::text
        and action = 'document.upload_consent' and created_at > now() - interval '1 hour') >= 10 then
    return false;
  end if;

  insert into public.audit_log (actor_id, actor_role, action, entity_type, entity_id, summary, metadata)
  values (p_customer, 'customer', 'document.upload_consent', 'customer', p_customer::text,
    'Accepted the privacy policy for a document upload', jsonb_build_object('kind', p_kind, 'policy_version', p_policy));
  return true;
end;
$$;
revoke all on function public.authorize_customer_document_upload(uuid, text, text) from public, anon, authenticated;
grant execute on function public.authorize_customer_document_upload(uuid, text, text) to service_role;
