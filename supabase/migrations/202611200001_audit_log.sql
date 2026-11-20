create table public.audit_log (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  actor_id uuid,
  actor_role text not null check (actor_role in ('admin', 'owner', 'customer', 'system')),
  actor_label text,
  action text not null,
  entity_type text not null,
  entity_id text,
  entity_label text,
  summary text not null,
  changes jsonb not null default '{}',
  reason text,
  metadata jsonb not null default '{}',
  constraint audit_log_size check (pg_column_size(changes) < 16384 and pg_column_size(metadata) < 8192)
);

create index audit_log_created_idx on public.audit_log (created_at desc, id desc);
create index audit_log_entity_idx on public.audit_log (entity_type, entity_id, id desc);
create index audit_log_actor_idx on public.audit_log (actor_id, created_at desc);
create index audit_log_action_idx on public.audit_log (action, id desc);
create index audit_log_booking_idx on public.audit_log ((metadata->>'booking_id'), id desc) where entity_type = 'payment';
create index audit_log_car_idx on public.audit_log ((metadata->>'car_id'), id desc) where entity_type = 'car_rate';
create index audit_log_owner_idx on public.audit_log ((metadata->>'owner_id'), id desc);

alter table public.audit_log enable row level security;
revoke all on public.audit_log from public, anon, authenticated, service_role;
revoke all on sequence public.audit_log_id_seq from public, anon, authenticated, service_role;
grant select on public.audit_log to authenticated;
create policy "Admins read audit log" on public.audit_log for select to authenticated using ((select public.is_admin()));

create function public.audit_log_immutable() returns trigger language plpgsql set search_path = '' as $$
begin
  raise exception 'The audit log is append-only.';
end;
$$;
create trigger audit_log_no_update before update or delete on public.audit_log
  for each statement execute function public.audit_log_immutable();
create trigger audit_log_no_truncate before truncate on public.audit_log
  for each statement execute function public.audit_log_immutable();
alter table public.audit_log enable always trigger audit_log_no_update;
alter table public.audit_log enable always trigger audit_log_no_truncate;

-- Staff notes and export searches can contain pasted personal numbers or links.
create function public.audit_safe_note(p_text text) returns text language sql immutable set search_path = '' as $$
  select left(regexp_replace(regexp_replace(p_text,
    '[[:alnum:]._%+/-]+@[[:alnum:].-]+\.[[:alpha:]]+|[^[:space:]]*[/\\][^[:space:]]*|[^[:space:]]*(token|secret|password|api[_-]?key)[[:space:]]*[=:][[:space:]]*[^[:space:]]+|eyJ[[:alnum:]_-]{5,}\.[[:alnum:]_-]+\.[[:alnum:]_-]+',
    '[redacted]', 'gi'), '([[:alnum:]]*([0-9][ .-]*){5,}[0-9][[:alnum:]]*|[A-Z][0-9]{2}-[0-9]{2}-[0-9]{6})', '[redacted]', 'gi'), 500);
$$;

create function public.audit_write(
  p_action text, p_entity_type text, p_entity_id text, p_label text,
  p_summary text, p_changes jsonb default '{}', p_reason text default null, p_metadata jsonb default '{}'
) returns void language plpgsql security definer set search_path = public as $$
declare
  actor uuid := auth.uid();
  role_name text;
  actor_name text;
begin
  if actor is null then
    role_name := 'system';
    actor_name := coalesce(nullif(current_setting('app.audit_actor', true), ''),
      case when auth.role() = 'service_role' then 'service' else 'system' end);
  else
    select p.role::text, p.full_name into role_name, actor_name from public.profiles p where p.id = actor;
  end if;

  insert into public.audit_log (actor_id, actor_role, actor_label, action, entity_type, entity_id, entity_label, summary, changes, reason, metadata)
  values (actor, coalesce(role_name, 'customer'), left(public.audit_safe_note(actor_name), 300), p_action,
    p_entity_type, p_entity_id, left(p_label, 300), left(p_summary, 500), p_changes,
    nullif(public.audit_safe_note(p_reason), ''), p_metadata);
end;
$$;

create function public.audit_row_change() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  entity text := tg_argv[0];
  tracked text[] := string_to_array(tg_argv[2], ',');
  masked text[] := coalesce(string_to_array(nullif(tg_argv[3], ''), ','), '{}');
  before_row jsonb := case when tg_op <> 'INSERT' then to_jsonb(old) end;
  after_row jsonb := case when tg_op <> 'DELETE' then to_jsonb(new) end;
  row_data jsonb := coalesce(after_row, before_row);
  record_id text := coalesce(row_data->>'id', row_data->>'key', row_data->>'owner_id');
  changes jsonb := '{}';
  metadata jsonb := '{}';
  field text;
  label text;
  title text;
  action_suffix text;
  detail text;
  before_value text;
  after_value text;
  reason text := nullif(current_setting('app.audit_reason', true), '');
begin
  -- Settings accept arbitrary JSON. Only retain values for known numeric keys.
  if entity = 'setting' and (
    record_id not in ('default_commission_rate', 'deposit_percent', 'payment_window_hours', 'min_credit_to_list', 'invoice_grace_days', 'plan_grace_days')
    or coalesce(jsonb_typeof(before_row->'value') not in ('number', 'null'), false)
    or coalesce(jsonb_typeof(after_row->'value') not in ('number', 'null'), false)
  ) then
    masked := array['value'];
  end if;

  foreach field in array tracked || masked loop
    if tg_op = 'UPDATE' and (before_row->field) is not distinct from (after_row->field) then continue; end if;
    if tg_op = 'DELETE' or (tg_op = 'INSERT' and after_row->>field is null) then continue; end if;
    if field = any(masked) then
      changes := changes || jsonb_build_object(field, jsonb_build_object('masked', true));
      continue;
    end if;

    before_value := before_row->>field;
    after_value := after_row->>field;
    if field in ('admin_note', 'note', 'reject_reason', 'business_name', 'full_name', 'name', 'address', 'brand', 'model', 'method') then
      before_value := public.audit_safe_note(before_value);
      after_value := public.audit_safe_note(after_value);
    end if;
    changes := changes || jsonb_build_object(field,
      case when tg_op = 'INSERT' then jsonb_build_object('to', left(after_value, 300))
           else jsonb_build_object('from', left(before_value, 300), 'to', left(after_value, 300)) end);
  end loop;
  if tg_op = 'UPDATE' and changes = '{}' then return null; end if;

  select string_agg(nullif(row_data->>column_name, ''), ' ' order by position)
    into label from unnest(string_to_array(tg_argv[1], ' ')) with ordinality as fields(column_name, position);

  case entity
    when 'payment' then
      select reference into label from public.bookings where id = (row_data->>'booking_id')::uuid;
      metadata := jsonb_build_object('booking_id', row_data->>'booking_id');
    when 'car_rate' then
      select concat_ws(' ', brand, model, plate_number, replace(row_data->>'mode', '_', ' '))
        into label from public.cars where id = (row_data->>'car_id')::uuid;
      label := coalesce(label, replace(row_data->>'mode', '_', ' '));
      metadata := jsonb_build_object('car_id', row_data->>'car_id');
    when 'topup', 'owner_plan', 'plan_payment' then
      select business_name into label from public.owners where id = (row_data->>'owner_id')::uuid;
      metadata := jsonb_build_object('owner_id', row_data->>'owner_id');
    else null;
  end case;

  if reason is null and tg_op = 'UPDATE' then
    reason := case
      when entity in ('application', 'contact') and changes ? 'admin_note' then after_row->>'admin_note'
      when entity = 'booking' and changes ? 'status' then after_row->>'cancel_reason'
      when entity = 'customer' and changes ? 'verification' then after_row->>'verification_rejection_reason'
      when entity = 'payment' and changes ? 'status' then after_row->>'rejection_reason'
      when entity = 'plan_payment' and changes ? 'status' then after_row->>'reject_reason'
      when entity = 'topup' and changes ? 'status' and after_row->>'status' = 'rejected' then after_row->>'note'
    end;
  end if;

  action_suffix := case tg_op when 'INSERT' then 'created' when 'DELETE' then 'deleted'
    else case when changes ? 'status' then 'status_changed' else 'updated' end end;
  label := left(case when entity in ('booking', 'payment', 'invoice') then label else public.audit_safe_note(label) end, 300);
  title := coalesce(label, initcap(replace(entity, '_', ' ')));
  if tg_op = 'UPDATE' then
    select string_agg(
      initcap(replace(key, '_', ' ')) ||
      case when value ? 'masked' or key in ('admin_note', 'note', 'reject_reason') then ' changed'
           when key = 'commission_rate' then ' ' ||
             coalesce(trim_scale((value->>'from')::numeric * 100)::text || '%', 'empty') || ' → ' ||
             coalesce(trim_scale((value->>'to')::numeric * 100)::text || '%', 'empty')
           else ' ' || coalesce(left(value->>'from', 65), 'empty') || ' → ' || coalesce(left(value->>'to', 65), 'empty') end,
      ', ' order by (key <> 'status'), key)
    into detail from jsonb_each(changes);
  end if;

  perform public.audit_write(entity || '.' || action_suffix, entity, record_id, label,
    title || ' ' || replace(action_suffix, '_', ' ') || coalesce(' · ' || detail, ''), changes, reason, metadata);
  -- AFTER triggers ignore the return value. Notification triggers are independent of the audit insert.
  return null;
end;
$$;

create function public.admin_log_event(
  p_action text, p_entity_type text, p_entity_id text, p_metadata jsonb default '{}'
) returns void language plpgsql security definer set search_path = public as $$
declare
  label text;
  document text := p_metadata->>'document';
  metadata jsonb := '{}';
  field text;
  value text;
begin
  if not coalesce(public.is_admin(), false) then raise exception 'Administrator access required.'; end if;

  if p_action = 'document.viewed' then
    if p_entity_type = 'customer' and document in ('Driver’s license', 'ID') then
      select full_name into label from public.profiles where id = p_entity_id::uuid and role = 'customer';
    elsif p_entity_type = 'application' and document in ('Driver’s license', 'ID', 'Vehicle registration') then
      select business_name into label from public.owner_applications where id = p_entity_id::uuid;
    else
      raise exception 'Unknown document type.';
    end if;
    if not found then raise exception 'Document record not found.'; end if;
    label := left(public.audit_safe_note(label), 300);
    perform public.audit_write('document.viewed', p_entity_type, p_entity_id, label,
      format('Viewed %s for %s', document, coalesce(nullif(label, ''), p_entity_type)),
      '{}', null, jsonb_build_object('document', document));
  elsif p_action = 'audit.exported' then
    foreach field in array array['from','to','actor_role','actor','entity_type','entity_id','action','q','reason'] loop
      value := p_metadata->>field;
      if value is null then continue; end if;
      metadata := metadata || jsonb_build_object(field, case
        when field in ('from','to') and value ~ '^\d{4}-\d{2}-\d{2}$' then value
        when field = 'entity_id' and value ~ '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$' then value
        else left(public.audit_safe_note(value), 100) end);
    end loop;
    perform public.audit_write('audit.exported', 'audit', null, null, 'Exported the audit log', '{}', null, metadata);
  else
    raise exception 'Unknown audit action.';
  end if;
end;
$$;

revoke all on function public.audit_log_immutable(), public.audit_safe_note(text),
  public.audit_write(text,text,text,text,text,jsonb,text,jsonb), public.audit_row_change(),
  public.admin_log_event(text,text,text,jsonb) from public, anon, authenticated, service_role;
grant execute on function public.admin_log_event(text,text,text,jsonb) to authenticated;

create trigger audit_owners after insert or update or delete on public.owners
  for each row execute function public.audit_row_change('owner','business_name','business_name,commission_rate,fee_mode,deposit_percent,is_active,payment_qr_verified,archived_at','contact_phone,payment_qr_path,payment_method_label,payment_account_name,gcash_number');
create trigger audit_profiles after update on public.profiles
  for each row execute function public.audit_row_change('customer','full_name','role,verification,full_name,license_classes,customer_archived_at','phone,license_path,id_path');
create trigger audit_owner_applications after insert or update on public.owner_applications
  for each row execute function public.audit_row_change('application','business_name','status,reviewed_by,admin_note,preferred_plan','full_name,email,phone,message,notes,car_photo_paths,orcr_path,license_path,id_path,payment_qr_path,plate_number');
create trigger audit_bookings after insert or update on public.bookings
  for each row execute function public.audit_row_change('booking','reference','status,total_price,commission_amount,owner_earnings,deposit_amount,deposit_refund_status,start_date,end_date,car_id,customer_id,payment','');
create trigger audit_payments after insert or update on public.payments
  for each row execute function public.audit_row_change('payment','','status,amount,method','proof_path,reference_no');
create trigger audit_owner_credit_ledger after insert or update on public.owner_credit_ledger
  for each row execute function public.audit_row_change('topup','','status,amount,type,reviewed_by,note','proof_path,reference_no');
create trigger audit_cars after insert or update or delete on public.cars
  for each row execute function public.audit_row_change('car','brand model plate_number','is_active,brand,model,year,plate_number,allows_self_drive,allows_with_driver,owner_id,vehicle_type,plan_hidden','');
create trigger audit_car_rates after insert or update or delete on public.car_rates
  for each row execute function public.audit_row_change('car_rate','mode','daily_rate,deposit_amount,license_required,included_hours,overtime_per_hour','');
create trigger audit_commission_invoices after insert or update on public.commission_invoices
  for each row execute function public.audit_row_change('invoice','period_month','status,gross_amount,commission_due,period_month,paid_at,total_bookings','reference_no');
create trigger audit_settings after insert or update on public.settings
  for each row execute function public.audit_row_change('setting','key','key,value','');
create trigger audit_promo_codes after insert or update or delete on public.promo_codes
  for each row execute function public.audit_row_change('promo','code','code,is_active,discount_type,discount_value,starts_at,ends_at,min_days,max_uses','');
create trigger audit_drivers after insert or update or delete on public.drivers
  for each row execute function public.audit_row_change('driver','full_name','is_active,full_name','phone');
create trigger audit_pickup_locations after insert or update or delete on public.pickup_locations
  for each row execute function public.audit_row_change('pickup_location','name','name,address,delivery_fee,is_active,owner_id','');
create trigger audit_plans after insert or update or delete on public.plans
  for each row execute function public.audit_row_change('plan','name','code,name,price_php,max_active_vehicles,commission_rate,is_active,is_public,is_featured,support_level','');
create trigger audit_owner_plans after insert or update or delete on public.owner_plans
  for each row execute function public.audit_row_change('owner_plan','','plan_id,status,started_at,expires_at,vehicle_limit_override,commission_override','');
create trigger audit_plan_payments after insert or update or delete on public.plan_payments
  for each row execute function public.audit_row_change('plan_payment','','plan_id,amount,status,months,period_start,period_end,reviewed_by,reject_reason','reference_no,proof_path');
create trigger audit_contact_messages after update on public.contact_messages
  for each row execute function public.audit_row_change('contact','topic','status,admin_note','email,mobile,message');

-- Retain 24 months. Any purge requires a reviewed database maintenance migration.
