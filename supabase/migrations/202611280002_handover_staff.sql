create table public.owner_staff (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.owners(id),
  profile_id uuid references public.profiles(id),
  display_name text not null check (char_length(display_name) between 1 and 100),
  email text not null check (email = lower(email) and char_length(email) <= 254),
  status text not null check (status in ('invited','active','paused','removed')),
  invited_by uuid not null references public.profiles(id),
  invited_at timestamptz not null default now(),
  accepted_at timestamptz,
  invite_token_hash text unique,
  invite_expires_at timestamptz,
  last_handover_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index owner_staff_current_email on public.owner_staff(owner_id, lower(email)) where status <> 'removed';
create unique index owner_staff_current_profile on public.owner_staff(owner_id, profile_id) where status <> 'removed';
create index owner_staff_profile_idx on public.owner_staff(profile_id, owner_id);
alter table public.owner_staff enable row level security;
revoke all on public.owner_staff from public, anon, authenticated;
grant select (id,owner_id,profile_id,display_name,email,status,invited_at,accepted_at,invite_expires_at,last_handover_at,created_at,updated_at)
  on public.owner_staff to authenticated;
create policy owner_staff_read on public.owner_staff for select to authenticated
  using (profile_id = (select auth.uid()) or exists (
    select 1 from public.owners o where o.id = owner_id and o.profile_id = (select auth.uid()) and o.is_active and o.archived_at is null
  ));

insert into public.settings(key,value) values ('max_staff_per_owner','3') on conflict (key) do nothing;
alter table public.settings add constraint max_staff_per_owner_valid check (
  case when key = 'max_staff_per_owner' then jsonb_typeof(value) = 'number' and (value #>> '{}') ~ '^[0-9]{1,3}$' else true end
);

create function public.handover_actor(p_uid uuid, p_owner uuid default null)
returns table(owner_id uuid,role text,staff_id uuid)
language sql stable security definer set search_path = '' as $$
  select o.id,'owner',null::uuid from public.owners o
  where o.profile_id = p_uid and o.is_active and o.archived_at is null and p_owner is null
  union all
  select o.id,'staff',s.id from public.owner_staff s join public.owners o on o.id=s.owner_id
  join public.profiles p on p.id=s.profile_id
  where s.profile_id=p_uid and s.status='active' and o.is_active and o.archived_at is null
    and p.role='customer' and (p_owner is null or o.id=p_owner)
$$;

create function public.owner_staff_limit()
returns integer language sql stable security definer set search_path = '' as $$
  select coalesce((select (value #>> '{}')::integer from public.settings where key='max_staff_per_owner'),3)
  where exists(select 1 from public.handover_actor(auth.uid()) a where a.role='owner')
$$;

create function public.staff_invite_rate(p_owner uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare used integer;
begin
  insert into public.payment_request_limits as limits(scope,caller,bucket,requests)
  values('staff-invite',p_owner::text,date_trunc('day',now() at time zone 'Asia/Manila') at time zone 'Asia/Manila',1)
  on conflict(scope,caller,bucket) do update set requests=limits.requests+1 where limits.requests<10
  returning requests into used;
  if used is null then raise exception 'STAFF_INVITE_RATE'; end if;
end;
$$;

create function public.owner_invite_staff(p_name text,p_email text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare o public.owners%rowtype; staff uuid; token text; name text := btrim(p_name); normalized_email text := lower(btrim(p_email));
begin
  select * into o from public.owners where profile_id=auth.uid() and is_active and archived_at is null for update;
  if not found then raise exception 'STAFF_NOT_ALLOWED'; end if;
  if name is null or char_length(name) not between 1 and 100 or name ~ '[[:cntrl:]]'
    or normalized_email is null or char_length(normalized_email)>254 or normalized_email !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$' then
    raise exception 'STAFF_INVALID_DETAILS'; end if;
  if exists(select 1 from public.owner_staff s where s.owner_id=o.id and s.email=normalized_email and s.status<>'removed') then
    raise exception 'STAFF_DUPLICATE'; end if;
  if (select count(*) from public.owner_staff s where s.owner_id=o.id and s.status<>'removed') >= public.owner_staff_limit() then
    raise exception 'STAFF_LIMIT'; end if;
  perform public.staff_invite_rate(o.id);
  token := encode(public.pickup_random_bytes(32),'hex');
  insert into public.owner_staff(owner_id,display_name,email,status,invited_by,invite_token_hash,invite_expires_at)
  values(o.id,name,normalized_email,'invited',auth.uid(),encode(sha256(convert_to(token,'UTF8')),'hex'),now()+interval '7 days') returning id into staff;
  perform public.audit_write('staff.invited','staff',staff::text,public.audit_safe_note(name),'Staff invited','{}',null,jsonb_build_object('owner_id',o.id));
  return jsonb_build_object('id',staff,'token',token,'email',normalized_email,'business',o.business_name);
end;
$$;

create function public.owner_set_staff_status(p_staff uuid,p_status text)
returns void language plpgsql security definer set search_path = '' as $$
declare s public.owner_staff%rowtype; action text;
begin
  select staff.* into s from public.owner_staff staff join public.owners o on o.id=staff.owner_id
  where staff.id=p_staff and o.profile_id=auth.uid() and o.is_active and o.archived_at is null for update of staff;
  if not found or p_status is null or not coalesce(
    (p_status='removed' and s.status<>'removed') or (p_status='paused' and s.status='active') or (p_status='active' and s.status='paused'),false
  ) then raise exception 'STAFF_NOT_ALLOWED'; end if;
  update public.owner_staff set status=p_status,updated_at=now(),invite_token_hash=null,invite_expires_at=null where id=s.id;
  action := case p_status when 'active' then 'resumed' else p_status end;
  perform public.audit_write('staff.'||action,'staff',s.id::text,public.audit_safe_note(s.display_name),'Staff access '||action,'{}',null,jsonb_build_object('owner_id',s.owner_id));
end;
$$;

create function public.owner_resend_staff_invite(p_staff uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare s public.owner_staff%rowtype; business text; token text;
begin
  select staff.* into s from public.owner_staff staff join public.owners o on o.id=staff.owner_id
  where staff.id=p_staff and staff.status='invited' and o.profile_id=auth.uid() and o.is_active and o.archived_at is null for update of staff;
  if not found then raise exception 'STAFF_NOT_ALLOWED'; end if;
  select business_name into business from public.owners where id=s.owner_id;
  perform public.staff_invite_rate(s.owner_id);
  token := encode(public.pickup_random_bytes(32),'hex');
  update public.owner_staff set invite_token_hash=encode(sha256(convert_to(token,'UTF8')),'hex'),
    invite_expires_at=now()+interval '7 days',updated_at=now() where id=s.id;
  perform public.audit_write('staff.invite_resent','staff',s.id::text,public.audit_safe_note(s.display_name),'Staff invite resent','{}',null,jsonb_build_object('owner_id',s.owner_id));
  return jsonb_build_object('id',s.id,'token',token,'email',s.email,'business',business);
end;
$$;

create function public.staff_invite_preview(p_token text)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('display_name',s.display_name,'email',s.email,'business',o.business_name)
  from public.owner_staff s join public.owners o on o.id=s.owner_id
  where p_token ~ '^[a-f0-9]{64}$' and s.invite_token_hash=encode(sha256(convert_to(p_token,'UTF8')),'hex')
    and s.status='invited' and s.invite_expires_at>now() and o.is_active and o.archived_at is null
$$;

create function public.staff_accept_invite(p_token text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare s public.owner_staff%rowtype;
begin
  if auth.uid() is null or p_token is null or p_token !~ '^[a-f0-9]{64}$' then raise exception 'STAFF_INVITE_INVALID'; end if;
  select staff.* into s from public.owner_staff staff join public.owners o on o.id=staff.owner_id
  where staff.invite_token_hash=encode(sha256(convert_to(p_token,'UTF8')),'hex') and staff.status='invited'
    and staff.invite_expires_at>clock_timestamp() and o.is_active and o.archived_at is null for update of staff;
  if not found then raise exception 'STAFF_INVITE_INVALID'; end if;
  if not exists(select 1 from auth.users u join public.profiles p on p.id=u.id
    where u.id=auth.uid() and u.email_confirmed_at is not null and lower(u.email)=s.email and p.role='customer') then
    raise exception 'STAFF_INVITE_ACCOUNT'; end if;
  update public.owner_staff set profile_id=auth.uid(),status='active',accepted_at=now(),updated_at=now(),
    invite_token_hash=null,invite_expires_at=null where id=s.id;
  perform public.audit_write('staff.accepted','staff',s.id::text,public.audit_safe_note(s.display_name),'Staff invite accepted','{}',null,jsonb_build_object('owner_id',s.owner_id));
  return s.owner_id;
end;
$$;

create function public.staff_businesses()
returns table(owner_id uuid,business text,display_name text,enabled boolean)
language sql stable security definer set search_path = '' as $$
  select distinct on (s.owner_id) s.owner_id,o.business_name,s.display_name,
    s.status='active' and o.is_active and o.archived_at is null and p.role='customer'
  from public.owner_staff s join public.owners o on o.id=s.owner_id join public.profiles p on p.id=s.profile_id
  where s.profile_id=auth.uid()
  order by s.owner_id, (s.status<>'removed') desc,s.created_at desc
$$;

create function public.staff_today_handovers(p_owner uuid)
returns table(reference text,customer_name text,vehicle_label text,handover_time time,kind text)
language sql stable security definer set search_path = '' as $$
  select b.reference::text,coalesce(p.full_name,'Customer'),concat_ws(' ',c.brand,c.model),
    case when b.status='confirmed' then b.pickup_time else null end,
    case when b.status='confirmed' then 'pickup' else 'return' end
  from public.handover_actor(auth.uid(),p_owner) a join public.bookings b on b.owner_id=a.owner_id
  join public.profiles p on p.id=b.customer_id join public.cars c on c.id=b.car_id
  where p_owner is not null and a.role='staff' and (
    (b.status='confirmed' and b.start_date=(now() at time zone 'Asia/Manila')::date)
    or (b.status='picked_up' and b.end_date=(now() at time zone 'Asia/Manila')::date)
  )
  order by 4 nulls last,1
$$;

create function public.owner_staff_history(p_staff uuid)
returns table(reference text,kind text,vehicle_label text,customer_name text,created_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select b.reference::text,e.kind,concat_ws(' ',c.brand,c.model),coalesce(p.full_name,'Customer'),e.created_at
  from public.owner_staff s join public.handover_actor(auth.uid()) a on a.owner_id=s.owner_id and a.role='owner'
  join public.booking_pickup_events e on e.detail->>'staff_id'=s.id::text
  join public.bookings b on b.id=e.booking_id and b.owner_id=s.owner_id
  join public.cars c on c.id=b.car_id join public.profiles p on p.id=b.customer_id
  where s.id=p_staff and e.kind in ('pickup_confirmed','return_confirmed')
  order by e.created_at desc,e.id desc limit 10
$$;

create index booking_pickup_events_staff_idx on public.booking_pickup_events((detail->>'staff_id'),created_at desc)
  where kind in ('pickup_confirmed','return_confirmed');

create function public.lock_staff_handover(p_owner uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare staff uuid;
begin
  select s.id into staff
  from public.handover_actor(auth.uid(),p_owner) a
  join public.owner_staff s on s.id=a.staff_id
  join public.owners o on o.id=s.owner_id
  where a.role='staff' and s.status='active' and o.is_active and o.archived_at is null
  for update of s for share of o;
  if staff is null then raise exception 'STAFF_ACCESS_OFF'; end if;
  return staff;
end;
$$;

create function public.handover_event_detail(p_owner uuid,p_staff uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('actor_role',case when s.id is not null then 'staff' when public.is_admin() then 'admin' else 'owner' end,
    'staff_id',s.id,'staff_name',s.display_name,'owner_id',o.id,'owner_business',o.business_name)
  from public.owners o left join public.owner_staff s on s.id=p_staff and s.owner_id=o.id where o.id=p_owner
$$;

create function public.notify_staff_handover(p_booking public.bookings,p_staff uuid,p_return boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare name text; owner_profile uuid;
begin
  if p_staff is null then return; end if;
  update public.owner_staff set last_handover_at=now(),updated_at=now()
  where id=p_staff returning display_name into name;
  select profile_id into owner_profile from public.owners where id=p_booking.owner_id;
  perform public.notify(owner_profile,'staff_handover',case when p_return then 'Return recorded by staff' else 'Handover recorded by staff' end,
    (case when p_return then 'Returned by ' else 'Handed over by ' end)||name||': '||p_booking.reference,
    '/owner/bookings',p_booking.id,'{in_app,push}',true,
    'staff-handover:'||p_booking.id||':'||p_return);
end;
$$;

revoke all on function public.handover_actor(uuid,uuid),public.staff_invite_rate(uuid),public.lock_staff_handover(uuid),
  public.handover_event_detail(uuid,uuid),public.notify_staff_handover(public.bookings,uuid,boolean),
  public.owner_staff_limit(),public.owner_invite_staff(text,text),public.owner_set_staff_status(uuid,text),
  public.owner_resend_staff_invite(uuid),public.staff_invite_preview(text),public.staff_accept_invite(text),
  public.staff_businesses(),public.staff_today_handovers(uuid),public.owner_staff_history(uuid)
from public,anon,authenticated;
grant execute on function public.owner_staff_limit(),public.owner_invite_staff(text,text),public.owner_set_staff_status(uuid,text),
  public.owner_resend_staff_invite(uuid),public.staff_accept_invite(text),public.staff_businesses(),
  public.staff_today_handovers(uuid),public.owner_staff_history(uuid) to authenticated;
grant execute on function public.staff_invite_preview(text) to anon,authenticated;


create function public.lookup_handover_pass(p_token text,p_code text,p_owner uuid)
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
  select owner_id into actor_owner from public.handover_actor(actor,p_owner) a
  where a.role = case when p_owner is null then 'owner' else 'staff' end;
  if actor_owner is null and p_owner is not null then return '{"result":"STAFF_ACCESS_OFF"}'::jsonb; end if;
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
    select * into p from public.booking_pickup_passes where token = p_token and (case when p_owner is not null then owner_id=actor_owner else public.pickup_actor_allowed(owner_id) end);
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
    'plate',case when p_owner is null then vehicle.plate_number end,'start_date',b.start_date,'end_date',b.end_date,'mode',b.mode,
    'payment',case when p_owner is null then b.payment::text end,'balance_at_pickup',case when b.payment = 'paid' then 0 else b.balance_at_pickup end,
    'deposit_amount',case when p_owner is null and b.mode = 'self_drive' then b.deposit_amount else 0 end,
    'license_ok',p_owner is null and profile.verification = 'approved' and nullif(btrim(profile.license_path),'') is not null,
    'id_ok',p_owner is null and profile.verification = 'approved' and nullif(btrim(profile.id_path),'') is not null,
    'docs_required',public.pickup_docs_required(b),'documents_verified',profile.verification = 'approved','pickup_today',day = b.start_date,'stage',case when is_return then 'return' else 'pickup' end);
end;
$$;

create function public.confirm_handover_pickup(
  p_booking uuid,p_token text,p_id_checked boolean,p_balance_received boolean,
  p_balance_method text,p_override_reason text,p_code text,p_owner uuid
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
  staff uuid;
begin
  if p_owner is not null then staff := public.lock_staff_handover(p_owner); end if;
  select * into b from public.bookings where id = p_booking
    and (case when p_owner is not null then owner_id=p_owner else public.pickup_actor_allowed(owner_id) end) for update;
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
  if staff is not null and outside_window then raise exception 'NOT_TODAY'; end if;
  if staff is not null and reason <> '' then raise exception 'STAFF_OVERRIDE_FORBIDDEN'; end if;
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
    'method',case when balance_due > 0 then p_balance_method end,'balance_amount',balance_due,'id_checked',true,'override',override_required) || public.handover_event_detail(b.owner_id,staff));
  update public.bookings set status = 'picked_up' where id = b.id;
  perform public.notify_staff_handover(b,staff,false);
  perform public.notify(b.customer_id,'pickup_confirmed','Pickup confirmed','Pickup confirmed. Enjoy your ride and drive safely.',
    '/account/bookings',b.id,'{in_app,push}',true,'pickup-confirmed:'||b.id);
end;
$$;

create function public.confirm_handover_return(p_booking uuid,p_token text,p_notes text,p_owner uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare b public.bookings%rowtype; p public.booking_pickup_passes%rowtype; staff uuid;
begin
  if p_owner is not null then staff := public.lock_staff_handover(p_owner); end if;
  if not public.pickup_return_enabled() then raise exception 'RETURN_NOT_ENABLED'; end if;
  if auth.uid() is null or public.is_admin() then raise exception 'PASS_NOT_VALID'; end if;
  select * into b from public.bookings where id = p_booking and (case when p_owner is not null then owner_id=p_owner else public.pickup_actor_allowed(owner_id) end) for update;
  if not found then raise exception 'PASS_NOT_VALID'; end if;
  select * into p from public.booking_pickup_passes where booking_id = b.id and owner_id = b.owner_id for update;
  if not found or p.status <> 'used' or p.token is distinct from p_token then raise exception 'PASS_NOT_VALID'; end if;
  if b.status in ('returned','completed') then raise exception 'ALREADY_USED'; end if;
  if b.status <> 'picked_up' then raise exception 'PASS_NOT_VALID'; end if;
  if char_length(coalesce(p_notes,'')) > 200 then raise exception 'PASS_NOT_VALID'; end if;
  perform public.log_pickup_event(b.id,'return_confirmed',jsonb_build_object('notes',public.pickup_safe_note(p_notes)) || public.handover_event_detail(b.owner_id,staff));
  update public.bookings set status = 'returned' where id = b.id;
  perform public.notify_staff_handover(b,staff,true);
  perform public.notify(b.customer_id,'return_confirmed','Vehicle return confirmed','Your rental return was recorded.',
    '/account/bookings',b.id,'{in_app,push}',true,'pickup-return:'||b.id);
end;
$$;


-- Keep the original RPC signatures and the owner/admin authorization paths.
create or replace function public.owner_lookup_pickup_pass(p_token text default null,p_code text default null)
returns jsonb language sql security definer set search_path = '' as $$
  select public.lookup_handover_pass(p_token,p_code,null)
$$;
create or replace function public.owner_confirm_pickup(p_booking uuid,p_token text,p_id_checked boolean,p_balance_received boolean default false,
  p_balance_method text default null,p_override_reason text default null,p_code text default null)
returns void language sql security definer set search_path = '' as $$
  select public.confirm_handover_pickup(p_booking,p_token,p_id_checked,p_balance_received,p_balance_method,p_override_reason,p_code,null)
$$;
create or replace function public.owner_confirm_return(p_booking uuid,p_token text,p_notes text default null)
returns void language sql security definer set search_path = '' as $$
  select public.confirm_handover_return(p_booking,p_token,p_notes,null)
$$;

create function public.staff_lookup_pickup_pass(p_owner uuid,p_token text default null,p_code text default null)
returns jsonb language sql security definer set search_path = '' as $$
  select case when p_owner is null then '{"result":"NOT_VALID"}'::jsonb
    else public.lookup_handover_pass(p_token,p_code,p_owner) end
$$;
create function public.staff_confirm_pickup(p_owner uuid,p_booking uuid,p_token text,p_id_checked boolean,p_balance_received boolean,
  p_balance_method text,p_code text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if p_owner is null then raise exception 'STAFF_ACCESS_OFF'; end if;
  perform public.confirm_handover_pickup(p_booking,p_token,p_id_checked,p_balance_received,p_balance_method,null,p_code,p_owner);
end;
$$;
create function public.staff_confirm_return(p_owner uuid,p_booking uuid,p_token text,p_notes text default null)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if p_owner is null then raise exception 'STAFF_ACCESS_OFF'; end if;
  perform public.confirm_handover_return(p_booking,p_token,p_notes,p_owner);
end;
$$;
revoke all on function public.lookup_handover_pass(text,text,uuid),
  public.confirm_handover_pickup(uuid,text,boolean,boolean,text,text,text,uuid),
  public.confirm_handover_return(uuid,text,text,uuid),
  public.staff_lookup_pickup_pass(uuid,text,text),public.staff_confirm_pickup(uuid,uuid,text,boolean,boolean,text,text),
  public.staff_confirm_return(uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.staff_lookup_pickup_pass(uuid,text,text),public.staff_confirm_pickup(uuid,uuid,text,boolean,boolean,text,text),
  public.staff_confirm_return(uuid,uuid,text,text) to authenticated;

drop function public.owner_pickup_history();
create function public.owner_pickup_history()
returns table(booking_id uuid,kind text,created_at timestamptz,staff_name text)
language sql stable security definer set search_path = '' as $$
  select distinct on (e.booking_id) e.booking_id,e.kind,e.created_at,e.detail->>'staff_name'
  from public.booking_pickup_events e join public.bookings b on b.id=e.booking_id
  join public.handover_actor(auth.uid()) a on a.owner_id=b.owner_id and a.role='owner'
  where e.kind in ('pickup_confirmed','manual')
  order by e.booking_id,e.created_at desc,e.id desc
$$;
revoke all on function public.owner_pickup_history() from public,anon,authenticated;
grant execute on function public.owner_pickup_history() to authenticated;

-- This owner-only settings view was previously readable by any signed-in customer.
create or replace view public.owner_payment_settings with (security_barrier = true) as
select key,value from public.settings
where key in ('platform_account_name','platform_qr_path','payment_instructions','min_credit_to_list')
  and (public.is_admin() or exists (
    select 1 from public.owners o where o.profile_id=auth.uid() and o.is_active and o.archived_at is null
  ));

alter table public.audit_log drop constraint audit_log_actor_role_check;
alter table public.audit_log add constraint audit_log_actor_role_check
  check (actor_role in ('admin','owner','customer','system','staff'));

create or replace function public.audit_write(
  p_action text,p_entity_type text,p_entity_id text,p_label text,p_summary text,
  p_changes jsonb default '{}',p_reason text default null,p_metadata jsonb default '{}'
) returns void language plpgsql security definer set search_path = '' as $$
declare actor uuid := auth.uid(); role_name text; actor_name text;
begin
  if actor is null then
    role_name := 'system';
    actor_name := coalesce(nullif(current_setting('app.audit_actor',true),''),
      case when auth.role()='service_role' then 'service' else 'system' end);
  else
    select p.role::text,p.full_name into role_name,actor_name from public.profiles p where p.id=actor;
    if p_action in ('pickup.pickup_confirmed','pickup.return_confirmed') and p_metadata->>'actor_role'='staff'
      and exists (select 1 from public.owner_staff s where s.id::text=p_metadata->>'staff_id' and s.profile_id=actor) then
      role_name := 'staff';
      actor_name := p_metadata->>'staff_name';
    end if;
  end if;
  insert into public.audit_log(actor_id,actor_role,actor_label,action,entity_type,entity_id,entity_label,summary,changes,reason,metadata)
  values(actor,coalesce(role_name,'customer'),left(public.audit_safe_note(actor_name),300),p_action,
    p_entity_type,p_entity_id,left(p_label,300),left(p_summary,500),p_changes,nullif(public.audit_safe_note(p_reason),''),p_metadata);
end;
$$;
