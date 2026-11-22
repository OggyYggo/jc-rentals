insert into public.settings(key,value) values ('pickup_return_scan','false') on conflict (key) do nothing;
alter table public.settings add constraint pickup_return_flag_valid
  check (key <> 'pickup_return_scan' or jsonb_typeof(value) = 'boolean');

create function public.pickup_return_enabled()
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((select (value #>> '{}')::boolean from public.settings where key = 'pickup_return_scan'),false)
$$;

create function public.owner_confirm_return(p_booking uuid,p_token text,p_notes text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare b public.bookings%rowtype; p public.booking_pickup_passes%rowtype;
begin
  if not public.pickup_return_enabled() then raise exception 'RETURN_NOT_ENABLED'; end if;
  if auth.uid() is null or public.is_admin() then raise exception 'PASS_NOT_VALID'; end if;
  select * into b from public.bookings where id = p_booking and public.pickup_actor_allowed(owner_id) for update;
  if not found then raise exception 'PASS_NOT_VALID'; end if;
  select * into p from public.booking_pickup_passes where booking_id = b.id and owner_id = b.owner_id for update;
  if not found or p.status <> 'used' or p.token is distinct from p_token then raise exception 'PASS_NOT_VALID'; end if;
  if b.status in ('returned','completed') then raise exception 'ALREADY_USED'; end if;
  if b.status <> 'picked_up' then raise exception 'PASS_NOT_VALID'; end if;
  if char_length(coalesce(p_notes,'')) > 200 then raise exception 'PASS_NOT_VALID'; end if;
  perform public.log_pickup_event(b.id,'return_confirmed',jsonb_build_object('notes',public.pickup_safe_note(p_notes)));
  update public.bookings set status = 'returned' where id = b.id;
  perform public.notify(b.customer_id,'return_confirmed','Vehicle return confirmed','Your rental return was recorded.',
    '/account/bookings',b.id,'{in_app,push}',true,'pickup-return:'||b.id);
end;
$$;

revoke all on function public.pickup_return_enabled(),public.owner_confirm_return(uuid,text,text) from public,anon,authenticated;
grant execute on function public.owner_confirm_return(uuid,text,text) to authenticated;

create or replace function public.owner_lookup_pickup_pass(p_token text default null,p_code text default null)
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
  locked_until timestamptz;
  outcome text;
  is_return boolean;
  neutral constant jsonb := '{"result":"NOT_VALID"}';
begin
  if actor is null then return neutral; end if;
  select id into actor_owner from public.owners where profile_id = actor and is_active;
  if actor_owner is null and not public.is_admin() then return neutral; end if;

  -- Serialize failed-attempt accounting for concurrent requests by one actor.
  perform pg_advisory_xact_lock(hashtextextended('pickup-scan:'||actor,0));
  select count(*) filter (where not rate_limited and pickup_scan_attempts.locked_until is null),max(pickup_scan_attempts.locked_until)
    into failures,locked_until from public.pickup_scan_attempts
    where owner_profile_id = actor and not ok and created_at > clock_timestamp() - interval '10 minutes';
  if locked_until > clock_timestamp() then
    insert into public.pickup_scan_attempts(owner_profile_id,ok,rate_limited) values (actor,false,true);
    return jsonb_build_object('result','LOCKED','retry_after_seconds',
      greatest(1,ceil(extract(epoch from locked_until - clock_timestamp()))));
  end if;

  if p_token ~ '^[a-f0-9]{64}$' and p_code is null then
    select * into p from public.booking_pickup_passes where token = p_token and public.pickup_actor_allowed(owner_id);
  elsif p_code ~ '^[0-9]{6}$' and p_token is null then
    select * into p from public.booking_pickup_passes where backup_code = p_code and owner_id = actor_owner and status = 'active';
  end if;
  select * into b from public.bookings where id = p.booking_id and owner_id = p.owner_id;
  if b.id is null or p.status = 'revoked' or b.status in ('cancelled','expired','rejected') or not public.pickup_reservation_verified(b) then
    insert into public.pickup_scan_attempts(owner_profile_id,ok,locked_until)
    values (actor,false,case when failures >= 4 then clock_timestamp() + interval '10 minutes' end);
    if failures >= 4 then perform public.log_pickup_event(null,'lookup_failed',jsonb_build_object('failures',5)); end if;
    return neutral;
  end if;
  insert into public.pickup_scan_attempts(owner_profile_id,ok,pass_id) values (actor,true,p.id);
  is_return := p.status = 'used' and b.status = 'picked_up' and p_token is not null
    and not public.is_admin() and public.pickup_return_enabled();
  if p.status = 'used' and not is_return then return jsonb_build_object('result','ALREADY_USED','used_at',p.used_at); end if;
  if b.status <> 'confirmed' and not is_return then return neutral; end if;
  select * into dates from public.pickup_window(b);
  select * into profile from public.profiles where id = b.customer_id;
  select * into vehicle from public.cars where id = b.car_id;
  outcome := case when is_return then 'OK' when day not between dates.valid_from and dates.valid_until then 'NOT_TODAY'
    when public.pickup_docs_required(b) and profile.verification is distinct from 'approved' then 'DOCS_NOT_VERIFIED'
    else 'OK' end;
  return jsonb_build_object('result',outcome,'booking_id',b.id,'reference',b.reference,
    'customer_name',profile.full_name,'vehicle_label',concat_ws(' ',vehicle.brand,vehicle.model),
    'plate',vehicle.plate_number,'start_date',b.start_date,'end_date',b.end_date,'mode',b.mode,
    'payment',b.payment,'balance_at_pickup',case when b.payment = 'paid' then 0 else b.balance_at_pickup end,
    'deposit_amount',case when b.mode = 'self_drive' then b.deposit_amount else 0 end,
    'license_ok',profile.verification = 'approved' and nullif(btrim(profile.license_path),'') is not null,
    'id_ok',profile.verification = 'approved' and nullif(btrim(profile.id_path),'') is not null,
    'docs_required',public.pickup_docs_required(b),'documents_verified',profile.verification = 'approved','pickup_today',day = b.start_date,'stage',case when is_return then 'return' else 'pickup' end);
end;
$$;


create or replace function public.get_my_pickup_pass(p_booking uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  b public.bookings%rowtype;
  p public.booking_pickup_passes%rowtype;
  window_dates record;
  day date := (now() at time zone 'Asia/Manila')::date;
  pass_state text;
  label text;
begin
  select * into b from public.bookings where id = p_booking and customer_id = auth.uid();
  if not found then return null; end if;
  select * into p from public.booking_pickup_passes where booking_id = b.id and owner_id = b.owner_id;
  select * into window_dates from public.pickup_window(b);
  pass_state := case
    when b.status in ('cancelled','rejected') or p.status = 'revoked' then 'cancelled'
    when b.status = 'expired' then 'expired'
    when b.status = 'picked_up' and p.status = 'used' and public.pickup_return_enabled() then 'return_ready'
    when b.status in ('picked_up','returned','completed') then 'used'
    when b.status <> 'confirmed' or p.status is distinct from 'active' then 'not_ready'
    when day > window_dates.valid_until then 'expired'
    when day = b.start_date then 'today'
    else 'ready'
  end;
  select concat_ws(' ',brand,model) into label from public.cars where id = b.car_id;
  return jsonb_build_object('state',pass_state,'reference',b.reference,'start_date',b.start_date,'end_date',b.end_date,
    'pickup_time',b.pickup_time,'vehicle_label',label,'mode',b.mode,
    'balance_at_pickup',case when b.payment = 'paid' then 0 else b.balance_at_pickup end,
    'deposit_amount',case when b.mode = 'self_drive' then b.deposit_amount else 0 end,
    'valid_from',window_dates.valid_from,'valid_until',window_dates.valid_until,
    'used_at',coalesce(p.used_at,(select max(created_at) from public.booking_pickup_events where booking_id = b.id and kind = 'manual')))
    || case when pass_state in ('ready','today') then jsonb_build_object('token',p.token,'backup_code',p.backup_code,'rotations',p.rotations) when pass_state = 'return_ready' then jsonb_build_object('token',p.token) else '{}'::jsonb end;
end;
$$;
