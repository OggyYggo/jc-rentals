insert into public.settings (key,value) values
  ('pickup_early_days','1'),('pickup_late_days','0'),('pickup_require_verified_docs','true')
on conflict (key) do nothing;

alter table public.settings add constraint pickup_settings_valid check (
  case key
    when 'pickup_early_days' then jsonb_typeof(value) = 'number' and (value #>> '{}') ~ '^[0-3]$'
    when 'pickup_late_days' then jsonb_typeof(value) = 'number' and (value #>> '{}') ~ '^[0-3]$'
    when 'pickup_require_verified_docs' then jsonb_typeof(value) = 'boolean'
    else true
  end
);

create table public.booking_pickup_passes (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null unique references public.bookings(id) on delete cascade,
  owner_id uuid not null references public.owners(id),
  token text not null unique check (token ~ '^[a-f0-9]{64}$'),
  backup_code text not null check (backup_code ~ '^[0-9]{6}$'),
  status text not null default 'active' check (status in ('active','used','revoked')),
  rotations smallint not null default 0 check (rotations between 0 and 3),
  created_at timestamptz not null default now(),
  used_at timestamptz,
  used_by uuid references public.profiles(id)
);
create unique index booking_pickup_passes_owner_code_active
  on public.booking_pickup_passes (owner_id,backup_code) where status = 'active';

create table public.booking_pickup_events (
  id bigint generated always as identity primary key,
  booking_id uuid references public.bookings(id) on delete cascade,
  kind text not null check (kind in ('pass_created','pass_rotated','pass_revoked','pickup_confirmed','return_confirmed','override','manual','lookup_failed')),
  actor_id uuid references public.profiles(id),
  detail jsonb not null default '{}',
  created_at timestamptz not null default now(),
  check (booking_id is not null or kind = 'lookup_failed')
);
create index booking_pickup_events_booking_idx on public.booking_pickup_events(booking_id,created_at);
create table public.pickup_scan_attempts (
  id bigint generated always as identity primary key,
  owner_profile_id uuid not null references public.profiles(id) on delete cascade,
  ok boolean not null,
  created_at timestamptz not null default now()
);
create index pickup_scan_attempts_idx on public.pickup_scan_attempts(owner_profile_id,created_at);

alter table public.booking_pickup_passes enable row level security;
alter table public.booking_pickup_events enable row level security;
alter table public.pickup_scan_attempts enable row level security;
revoke all on public.booking_pickup_passes,public.booking_pickup_events,public.pickup_scan_attempts from public,anon,authenticated;
grant select (id,booking_id,owner_id,status,rotations,created_at,used_at,used_by) on public.booking_pickup_passes to authenticated;
grant select on public.booking_pickup_events,public.pickup_scan_attempts to authenticated;
create policy pickup_pass_admin on public.booking_pickup_passes for select to authenticated using ((select public.is_admin()));
create policy pickup_event_admin on public.booking_pickup_events for select to authenticated using ((select public.is_admin()));
create policy pickup_attempt_admin on public.pickup_scan_attempts for select to authenticated using ((select public.is_admin()));

-- Supabase installs pgcrypto in extensions. Also support local installations
-- that installed it into a different schema before the app migrations.
create function public.pickup_random_bytes(p_length integer)
returns bytea language plpgsql security definer set search_path = '' as $$
declare extension_schema text; bytes bytea;
begin
  select n.nspname into strict extension_schema from pg_catalog.pg_extension e
    join pg_catalog.pg_namespace n on n.oid = e.extnamespace where e.extname = 'pgcrypto';
  execute format('select %I.gen_random_bytes($1)',extension_schema) into bytes using p_length;
  return bytes;
end;
$$;

create function public.pickup_window(p_booking public.bookings)
returns table (valid_from date,valid_until date)
language sql stable security definer set search_path = '' as $$
  select p_booking.start_date - coalesce((select (value #>> '{}')::int from public.settings where key = 'pickup_early_days'),1),
    p_booking.end_date + coalesce((select (value #>> '{}')::int from public.settings where key = 'pickup_late_days'),0)
$$;

create function public.pickup_reservation_verified(p_booking public.bookings)
returns boolean language sql stable security definer set search_path = '' as $$
  select p_booking.payment in ('partial','paid') and (
    p_booking.amount_paid_online > 0 or exists (
      select 1 from public.payments p where p.booking_id = p_booking.id and p.status = 'verified' and p.method = 'owner_qr'
    )
  )
$$;

create function public.issue_pickup_credentials(p_booking uuid,p_owner uuid,p_replace boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare
  token_value text;
  code_value text;
  collision text;
  random_value bigint;
begin
  for attempt in 1..32 loop
    token_value := encode(public.pickup_random_bytes(32),'hex');
    random_value := ('x'||encode(public.pickup_random_bytes(4),'hex'))::bit(32)::bigint;
    if random_value >= 4294000000 then continue; end if;
    code_value := lpad((random_value % 1000000)::text,6,'0');
    if p_replace and exists (select 1 from public.booking_pickup_passes
      where booking_id = p_booking and (backup_code = code_value or token = token_value)) then continue; end if;
    begin
      if p_replace then
        update public.booking_pickup_passes set token = token_value,backup_code = code_value,
          owner_id = p_owner,status = 'active',created_at = now(),used_at = null,used_by = null
        where booking_id = p_booking;
      else
        insert into public.booking_pickup_passes(booking_id,owner_id,token,backup_code)
        values (p_booking,p_owner,token_value,code_value);
      end if;
      return;
    exception when unique_violation then
      get stacked diagnostics collision = CONSTRAINT_NAME;
      if collision not in ('booking_pickup_passes_owner_code_active','booking_pickup_passes_token_key') then raise; end if;
    end;
  end loop;
  raise exception 'PASS_UNAVAILABLE';
end;
$$;

create function public.pickup_safe_note(p_note text)
returns text language sql stable security definer set search_path = '' as $$
  select public.audit_safe_note(regexp_replace(
    regexp_replace(p_note,'[a-fA-F0-9]{64}','[redacted]','g'),'[0-9]{3}[ -]?[0-9]{3}','[redacted]','g'))
$$;

create function public.log_pickup_event(p_booking uuid,p_kind text,p_detail jsonb default '{}')
returns void language plpgsql security definer set search_path = '' as $$
begin
  insert into public.booking_pickup_events(booking_id,kind,actor_id,detail)
  values (p_booking,p_kind,auth.uid(),p_detail);
  if p_kind <> 'pass_created' then
    perform public.audit_write('pickup.'||p_kind,'booking',p_booking::text,null,
      case p_kind when 'lookup_failed' then 'Pickup lookup failure limit reached' else replace(p_kind,'_',' ') end,
      '{}',p_detail->>'reason',p_detail - 'reason');
  end if;
end;
$$;

create function public.ensure_pickup_pass(p_booking uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare b public.bookings%rowtype;
begin
  select * into b from public.bookings where id = p_booking for update;
  if not found or b.status <> 'confirmed' or not public.pickup_reservation_verified(b) then return; end if;
  if exists (select 1 from public.booking_pickup_passes where booking_id = b.id) then return; end if;
  perform public.issue_pickup_credentials(b.id,b.owner_id,false);
  perform public.log_pickup_event(b.id,'pass_created');
  perform public.notify(b.customer_id,'pickup_pass_ready','Your pickup pass is ready',
    'Open your pickup pass from your booking.','/account/bookings/'||b.id||'/pickup',b.id,
    '{in_app,push}',false,'pickup-pass:'||b.id);
end;
$$;

create function public.sync_booking_pickup_pass()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'UPDATE' and new.owner_id is distinct from old.owner_id then
    update public.booking_pickup_passes set status = 'revoked' where booking_id = new.id and status <> 'revoked';
    if found then perform public.log_pickup_event(new.id,'pass_revoked'); end if;
  elsif new.status in ('cancelled','rejected','expired') then
    update public.booking_pickup_passes set status = 'revoked' where booking_id = new.id and status <> 'revoked';
    if found then perform public.log_pickup_event(new.id,'pass_revoked'); end if;
  elsif new.status = 'confirmed' then
    perform public.ensure_pickup_pass(new.id);
  elsif tg_op = 'UPDATE' and old.status = 'confirmed' and new.status = 'picked_up' then
    update public.booking_pickup_passes set status = 'used',used_at = now(),used_by = auth.uid()
      where booking_id = new.id and status = 'active';
    if not exists (select 1 from public.booking_pickup_events where booking_id = new.id and kind = 'pickup_confirmed') then
      perform public.log_pickup_event(new.id,'manual');
    end if;
  end if;
  return new;
end;
$$;
create trigger sync_booking_pickup_pass after insert or update of status,owner_id on public.bookings
for each row execute function public.sync_booking_pickup_pass();

create function public.get_my_pickup_pass(p_booking uuid)
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
    || case when pass_state in ('ready','today') then jsonb_build_object('token',p.token,'backup_code',p.backup_code,'rotations',p.rotations) else '{}'::jsonb end;
end;
$$;

create function public.rotate_my_pickup_pass(p_booking uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare b public.bookings%rowtype; p public.booking_pickup_passes%rowtype;
begin
  select * into b from public.bookings where id = p_booking and customer_id = auth.uid() for update;
  if not found or b.status <> 'confirmed' then raise exception 'PASS_NOT_VALID'; end if;
  select * into p from public.booking_pickup_passes where booking_id = b.id and owner_id = b.owner_id for update;
  if not found or p.status <> 'active' or (now() at time zone 'Asia/Manila')::date >
    (select valid_until from public.pickup_window(b)) then raise exception 'PASS_NOT_VALID'; end if;
  if p.rotations >= 3 then raise exception 'ROTATION_LIMIT'; end if;
  perform public.issue_pickup_credentials(b.id,b.owner_id,true);
  update public.booking_pickup_passes set rotations = rotations + 1 where id = p.id;
  perform public.log_pickup_event(b.id,'pass_rotated');
end;
$$;

create function public.send_pickup_reminders()
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform public.notify(b.customer_id,'pickup_today','Your pickup is today','Open your pickup pass.',
    '/account/bookings/'||b.id||'/pickup',b.id,'{in_app,push}',false,'pickup-today:'||b.id||':'||b.start_date)
  from public.bookings b join public.booking_pickup_passes p on p.booking_id = b.id and p.owner_id = b.owner_id
  where b.status = 'confirmed' and p.status = 'active' and b.start_date = (now() at time zone 'Asia/Manila')::date;
  delete from public.pickup_scan_attempts where created_at < now() - interval '7 days';
end;
$$;

revoke all on function public.pickup_random_bytes(integer),public.pickup_window(public.bookings),
 public.pickup_reservation_verified(public.bookings),public.issue_pickup_credentials(uuid,uuid,boolean),
 public.pickup_safe_note(text),public.log_pickup_event(uuid,text,jsonb),public.ensure_pickup_pass(uuid),public.sync_booking_pickup_pass(),
 public.get_my_pickup_pass(uuid),public.rotate_my_pickup_pass(uuid),public.send_pickup_reminders()
 from public,anon,authenticated;
grant execute on function public.get_my_pickup_pass(uuid),public.rotate_my_pickup_pass(uuid) to authenticated;
grant execute on function public.send_pickup_reminders() to service_role;

select public.ensure_pickup_pass(id) from public.bookings where status = 'confirmed';

do $$ begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('send-pickup-reminders','0 0 * * *','select public.send_pickup_reminders()');
  end if;
end $$;
