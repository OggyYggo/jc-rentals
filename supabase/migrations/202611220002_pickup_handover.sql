alter table public.pickup_scan_attempts add column pass_id uuid references public.booking_pickup_passes(id) on delete cascade;
alter table public.pickup_scan_attempts add column rate_limited boolean not null default false;
create index pickup_scan_verified_idx on public.pickup_scan_attempts(owner_profile_id,pass_id,created_at) where ok;

create function public.pickup_actor_allowed(p_owner uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null and (public.is_admin() or exists (
    select 1 from public.owners where id = p_owner and profile_id = auth.uid() and is_active
  ))
$$;

create function public.pickup_docs_required(p_booking public.bookings)
returns boolean language sql stable security definer set search_path = '' as $$
  select p_booking.mode = 'self_drive' and coalesce(
    (select (value #>> '{}')::boolean from public.settings where key = 'pickup_require_verified_docs'),true
  )
$$;

create function public.owner_lookup_pickup_pass(p_token text default null,p_code text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := auth.uid();
  actor_owner uuid;
  p public.booking_pickup_passes%rowtype;
  b public.bookings%rowtype;
  profile public.profiles%rowtype;
  vehicle public.cars%rowtype;
  dates record;
  day date := (now() at time zone 'Asia/Manila')::date;
  failures integer;
  first_failure timestamptz;
  outcome text;
  neutral constant jsonb := '{"result":"NOT_VALID"}';
begin
  if actor is null then return neutral; end if;
  select id into actor_owner from public.owners where profile_id = actor and is_active;
  if actor_owner is null and not public.is_admin() then return neutral; end if;

  -- Serialize failed-attempt accounting for concurrent requests by one actor.
  perform pg_advisory_xact_lock(hashtextextended('pickup-scan:'||actor,0));
  select count(*),min(created_at) into failures,first_failure from public.pickup_scan_attempts
    where owner_profile_id = actor and not ok and not rate_limited and created_at > clock_timestamp() - interval '10 minutes';
  if failures >= 5 then
    insert into public.pickup_scan_attempts(owner_profile_id,ok,rate_limited) values (actor,false,true);
    return jsonb_build_object('result','LOCKED','retry_after_seconds',
      greatest(1,ceil(extract(epoch from first_failure + interval '10 minutes' - clock_timestamp()))));
  end if;

  if p_token ~ '^[a-f0-9]{64}$' and p_code is null then
    select * into p from public.booking_pickup_passes where token = p_token and public.pickup_actor_allowed(owner_id);
  elsif p_code ~ '^[0-9]{6}$' and p_token is null then
    select * into p from public.booking_pickup_passes where backup_code = p_code and owner_id = actor_owner and status = 'active';
  end if;
  select * into b from public.bookings where id = p.booking_id and owner_id = p.owner_id;
  if b.id is null or p.status = 'revoked' or b.status in ('cancelled','expired','rejected') or not public.pickup_reservation_verified(b) then
    insert into public.pickup_scan_attempts(owner_profile_id,ok) values (actor,false);
    if failures = 4 then perform public.log_pickup_event(null,'lookup_failed',jsonb_build_object('failures',5)); end if;
    return neutral;
  end if;
  insert into public.pickup_scan_attempts(owner_profile_id,ok,pass_id) values (actor,true,p.id);
  if p.status = 'used' then return jsonb_build_object('result','ALREADY_USED','used_at',p.used_at); end if;
  if b.status <> 'confirmed' then return neutral; end if;
  select * into dates from public.pickup_window(b);
  select * into profile from public.profiles where id = b.customer_id;
  select * into vehicle from public.cars where id = b.car_id;
  outcome := case when day not between dates.valid_from and dates.valid_until then 'NOT_TODAY'
    when public.pickup_docs_required(b) and profile.verification is distinct from 'approved' then 'DOCS_NOT_VERIFIED'
    else 'OK' end;
  return jsonb_build_object('result',outcome,'booking_id',b.id,'reference',b.reference,
    'customer_name',profile.full_name,'vehicle_label',concat_ws(' ',vehicle.brand,vehicle.model),
    'plate',vehicle.plate_number,'start_date',b.start_date,'end_date',b.end_date,'mode',b.mode,
    'payment',b.payment,'balance_at_pickup',case when b.payment = 'paid' then 0 else b.balance_at_pickup end,
    'deposit_amount',case when b.mode = 'self_drive' then b.deposit_amount else 0 end,
    'license_ok',profile.verification = 'approved' and nullif(btrim(profile.license_path),'') is not null,
    'id_ok',profile.verification = 'approved' and nullif(btrim(profile.id_path),'') is not null,
    'docs_required',public.pickup_docs_required(b),'documents_verified',profile.verification = 'approved','pickup_today',day = b.start_date,'stage','pickup');
end;
$$;

-- Called only after the caller has authorized and locked the booking.
create function public.record_pickup_balance(p_booking public.bookings,p_method text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if p_booking.payment = 'paid' then return; end if;
  if p_method is null or p_method not in ('cash','gcash','bank_transfer','other') then
    raise exception 'Payment method is not supported.';
  end if;
  if p_booking.balance_at_pickup > 0 then
    insert into public.payments(booking_id,amount,method,status,verified_by,verified_at)
    values (p_booking.id,p_booking.balance_at_pickup,p_method,'verified',auth.uid(),now());
  end if;
  update public.bookings set payment = 'paid' where id = p_booking.id;
end;
$$;

create or replace function public.owner_mark_payment_received(booking_uuid uuid,payment_method text default 'cash')
returns void language plpgsql security definer set search_path = '' as $$
declare b public.bookings%rowtype;
begin
  select booking.* into b from public.bookings booking join public.owners o on o.id = booking.owner_id
  where booking.id = booking_uuid and o.profile_id = auth.uid() and o.is_active
    and booking.status in ('confirmed','picked_up') for update of booking;
  if not found then raise exception 'Payment cannot be recorded for this booking.'; end if;
  perform public.record_pickup_balance(b,coalesce(payment_method,'cash'));
end;
$$;

create function public.owner_confirm_pickup(
  p_booking uuid,p_token text,p_id_checked boolean,p_balance_received boolean default false,
  p_balance_method text default null,p_override_reason text default null,p_code text default null
)
returns void language plpgsql security definer set search_path = '' as $$
declare
  b public.bookings%rowtype;
  p public.booking_pickup_passes%rowtype;
  admin boolean := public.is_admin();
  reason text := btrim(coalesce(p_override_reason,''));
  day date := (clock_timestamp() at time zone 'Asia/Manila')::date;
  outside_window boolean;
  verified boolean;
  balance_due numeric;
  override_required boolean;
begin
  select * into b from public.bookings where id = p_booking and public.pickup_actor_allowed(owner_id) for update;
  if not found then raise exception 'PASS_NOT_VALID'; end if;
  select * into p from public.booking_pickup_passes where booking_id = b.id and owner_id = b.owner_id for update;
  if not found or not coalesce(
    (p_token is not null and p_code is null and p.token = p_token)
    or (p_token is null and p_code is not null and p.backup_code = p_code and not admin
      and exists (select 1 from public.pickup_scan_attempts where owner_profile_id = auth.uid()
        and pass_id = p.id and ok and created_at >= greatest(p.created_at,now() - interval '10 minutes'))),false)
    then raise exception 'PASS_NOT_VALID'; end if;
  if p.status = 'used' then raise exception 'ALREADY_USED'; end if;
  if p.status <> 'active' or b.status <> 'confirmed' or not public.pickup_reservation_verified(b) then raise exception 'PASS_NOT_VALID'; end if;
  if p_id_checked is distinct from true then raise exception 'ID_CHECK_REQUIRED'; end if;
  select not (day between valid_from and valid_until) into outside_window from public.pickup_window(b);
  select verification = 'approved' into verified from public.profiles where id = b.customer_id for share;
  if public.pickup_docs_required(b) and verified is distinct from true and not admin then raise exception 'DOCS_NOT_VERIFIED'; end if;
  override_required := outside_window or admin;
  if override_required and char_length(reason) not between 5 and 200 then
    if outside_window then raise exception 'NOT_TODAY'; end if;
    raise exception 'OVERRIDE_REASON_REQUIRED';
  end if;

  balance_due := case when b.payment = 'paid' then 0 else b.balance_at_pickup end;
  if balance_due > 0 and (p_balance_received is distinct from true or p_balance_method is null
    or p_balance_method not in ('cash','gcash','bank_transfer','other')) then raise exception 'BALANCE_REQUIRED'; end if;
  if b.payment <> 'paid' then perform public.record_pickup_balance(b,case when balance_due > 0 then p_balance_method else 'cash' end); end if;

  if override_required then
    perform public.log_pickup_event(b.id,'override',jsonb_build_object('reason',public.pickup_safe_note(reason)));
    perform public.admin_alert('pickup.override','Pickup override recorded','Review the pickup in booking activity.','/admin/bookings','pickup-override:'||b.id);
  end if;
  perform public.log_pickup_event(b.id,'pickup_confirmed',jsonb_build_object(
    'method',case when balance_due > 0 then p_balance_method end,'balance_amount',balance_due,'id_checked',true,'override',override_required));
  update public.bookings set status = 'picked_up' where id = b.id;
  perform public.notify(b.customer_id,'pickup_confirmed','Pickup confirmed','Pickup confirmed. Enjoy your ride and drive safely.',
    '/account/bookings',b.id,'{in_app,push}',true,'pickup-confirmed:'||b.id);
end;
$$;

create function public.owner_pickup_history()
returns table(booking_id uuid,kind text,created_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select distinct on (e.booking_id) e.booking_id,e.kind,e.created_at
  from public.booking_pickup_events e join public.bookings b on b.id = e.booking_id
  join public.owners o on o.id = b.owner_id
  where o.profile_id = auth.uid() and o.is_active and e.kind in ('pickup_confirmed','manual')
  order by e.booking_id,e.created_at desc,e.id desc
$$;

create function public.take_pickup_request(p_caller text)
returns boolean language plpgsql security definer set search_path = '' as $$
declare count_now integer; bucket_time timestamptz := date_trunc('minute',now());
begin
  if p_caller is null or p_caller !~ '^[a-f0-9]{64}$' then return false; end if;
  insert into public.payment_request_limits as limits(scope,caller,bucket,requests) values ('pickup',p_caller,bucket_time,1)
  on conflict (scope,caller,bucket) do update set requests = least(limits.requests + 1,31)
  returning requests into count_now;
  return count_now <= 30;
end;
$$;

revoke all on function public.pickup_actor_allowed(uuid),public.pickup_docs_required(public.bookings),
 public.owner_lookup_pickup_pass(text,text),public.record_pickup_balance(public.bookings,text),
 public.owner_confirm_pickup(uuid,text,boolean,boolean,text,text,text),public.owner_pickup_history(),
 public.take_pickup_request(text),public.owner_mark_payment_received(uuid,text) from public,anon,authenticated;
grant execute on function public.owner_lookup_pickup_pass(text,text),public.owner_confirm_pickup(uuid,text,boolean,boolean,text,text,text),
 public.owner_pickup_history(),public.owner_mark_payment_received(uuid,text) to authenticated;
grant execute on function public.take_pickup_request(text) to service_role;
