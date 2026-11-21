insert into public.settings (key, value) values
  ('cancellation_free_hours', '24'),
  ('cancellation_fee_percent', '50'),
  ('pickup_reference_hour', '8'),
  ('refund_support_days', '3')
on conflict (key) do nothing;

alter table public.settings add constraint cancellation_settings_range check (
  case key
    when 'cancellation_free_hours' then jsonb_typeof(value) = 'number' and (value #>> '{}')::numeric between 0 and 168 and mod((value #>> '{}')::numeric, 1) = 0
    when 'cancellation_fee_percent' then jsonb_typeof(value) = 'number' and (value #>> '{}')::numeric between 0 and 100 and round((value #>> '{}')::numeric, 2) = (value #>> '{}')::numeric
    when 'pickup_reference_hour' then jsonb_typeof(value) = 'number' and (value #>> '{}')::numeric between 0 and 23 and mod((value #>> '{}')::numeric, 1) = 0
    when 'refund_support_days' then jsonb_typeof(value) = 'number' and (value #>> '{}')::numeric between 1 and 30 and mod((value #>> '{}')::numeric, 1) = 0
    else true
  end
);

alter table public.owners
  add column cancellation_free_hours integer check (cancellation_free_hours between 0 and 168),
  add column cancellation_fee_percent numeric(5,2) check (cancellation_fee_percent between 0 and 100);

alter table public.bookings
  add column rental_starts_at timestamptz,
  add column cancel_free_until timestamptz,
  add column cancel_fee_percent numeric(5,2) check (cancel_fee_percent between 0 and 100),
  add column cancelled_at timestamptz,
  add column cancelled_by uuid references public.profiles(id) on delete set null,
  add column cancelled_by_role text check (cancelled_by_role in ('customer','owner','admin','system')),
  add column cancel_kind text check (cancel_kind in ('free','late','no_show','owner','admin_full','admin_policy')),
  add column cancel_fee_amount numeric(10,2) not null default 0 check (cancel_fee_amount >= 0),
  add column refund_amount numeric(10,2) not null default 0 check (refund_amount >= 0),
  add column refund_reference text check (char_length(refund_reference) <= 80),
  add column refunded_at timestamptz,
  add constraint cancellation_paid_limit check (refund_amount + cancel_fee_amount <= amount_paid_online);

-- Keep historical refunds actionable where the owner verified the transfer.
update public.bookings set refund_amount = amount_paid_online
where status in ('cancelled','expired') and deposit_refund_status in ('owed','refunded');

update public.bookings
set rental_starts_at = (start_date + coalesce(pickup_time, time '08:00')) at time zone 'Asia/Manila',
    cancel_free_until = ((start_date + coalesce(pickup_time, time '08:00')) at time zone 'Asia/Manila') - interval '24 hours',
    cancel_fee_percent = 50
where status in ('pending','awaiting_payment','payment_review','confirmed');

create function public.snapshot_cancellation_policy()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  free_hours integer;
  pickup_hour integer;
begin
  select coalesce(o.cancellation_free_hours, (select (value #>> '{}')::integer from public.settings where key = 'cancellation_free_hours'), 24),
         coalesce(o.cancellation_fee_percent, (select (value #>> '{}')::numeric from public.settings where key = 'cancellation_fee_percent'), 50)
  into free_hours, new.cancel_fee_percent
  from public.owners o where o.id = new.owner_id;
  select (value #>> '{}')::integer into pickup_hour from public.settings where key = 'pickup_reference_hour';
  new.rental_starts_at := (new.start_date + coalesce(new.pickup_time, make_time(coalesce(pickup_hour, 8), 0, 0))) at time zone 'Asia/Manila';
  new.cancel_free_until := new.rental_starts_at - make_interval(hours => free_hours);
  return new;
end;
$$;
revoke all on function public.snapshot_cancellation_policy() from public, anon, authenticated;
-- PostgreSQL fires same-event triggers alphabetically. Pricing assigns owner_id first.
create trigger snapshot_cancellation_policy before insert on public.bookings
for each row execute function public.snapshot_cancellation_policy();

create function public.guard_cancellation_override()
returns trigger language plpgsql set search_path = '' as $$
begin
  if auth.uid() is not null and not public.is_admin() then
    raise exception 'Only administrators can change cancellation policy overrides.';
  end if;
  return new;
end;
$$;
revoke all on function public.guard_cancellation_override() from public, anon, authenticated;
create trigger guard_cancellation_override before update of cancellation_free_hours, cancellation_fee_percent on public.owners
for each row execute function public.guard_cancellation_override();

create function public.admin_set_cancellation_override(p_owner_id uuid, p_free_hours integer, p_fee_percent numeric)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'Administrator access required.'; end if;
  if p_fee_percent not between 0 and 100 then raise exception 'Enter a cancellation fee from 0 to 100 percent.'; end if;
  if p_fee_percent <> round(p_fee_percent, 2) then raise exception 'Use at most two decimal places.'; end if;
  update public.owners set cancellation_free_hours = p_free_hours, cancellation_fee_percent = p_fee_percent
  where id = p_owner_id;
  if not found then raise exception 'Owner not found.'; end if;
end;
$$;

create function public.calculate_booking_cancellation(b public.bookings, p_mode text)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  actor_role text;
  kind text;
  failure text;
  fee numeric := 0;
  paid numeric := b.amount_paid_online;
begin
  if auth.uid() is null then raise exception 'Not allowed.'; end if;
  actor_role := case when public.is_admin() then 'admin'
    when exists (select 1 from public.owners where id = b.owner_id and profile_id = auth.uid()) then 'owner'
    when b.customer_id = auth.uid() then 'customer' end;
  if actor_role is null then raise exception 'Not allowed.'; end if;
  if p_mode is null or p_mode not in ('auto','full_refund','no_show','apply_policy')
    or (actor_role = 'customer' and p_mode <> 'auto')
    or (actor_role = 'owner' and p_mode = 'apply_policy') then raise exception 'Invalid cancellation mode.'; end if;

  if b.status not in ('awaiting_payment','payment_review','confirmed') then
    failure := 'This booking can no longer be cancelled.';
  elsif actor_role = 'customer' and now() >= b.rental_starts_at then
    failure := 'Customers can only cancel before the rental starts.';
  elsif p_mode = 'no_show' and b.start_date > (now() at time zone 'Asia/Manila')::date then
    failure := 'A no-show can only be recorded on or after the rental start date.';
  end if;

  kind := case when paid = 0 then 'free'
    when p_mode = 'no_show' then 'no_show'
    when actor_role = 'owner' then 'owner'
    when actor_role = 'admin' and p_mode = 'full_refund' then 'admin_full'
    when actor_role = 'admin' then 'admin_policy'
    when now() <= b.cancel_free_until then 'free' else 'late' end;
  if kind in ('late','no_show','admin_policy') then
    fee := round(paid * b.cancel_fee_percent / 100, 2);
  end if;

  return jsonb_build_object('can_cancel', failure is null, 'error', failure, 'role', actor_role,
    'kind', kind, 'paid', paid, 'fee', fee, 'refund', paid - fee,
    'commission', round(fee * b.commission_rate, 2),
    'free_until', b.cancel_free_until, 'fee_percent', b.cancel_fee_percent);
end;
$$;
revoke all on function public.calculate_booking_cancellation(public.bookings, text) from public, anon, authenticated;

create function public.cancellation_preview(p_booking_id uuid, p_mode text default 'auto')
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  b public.bookings%rowtype;
begin
  select * into b from public.bookings where id = p_booking_id;
  if not found then raise exception 'Booking not found.'; end if;
  return public.calculate_booking_cancellation(b, p_mode);
end;
$$;

drop function public.cancel_booking(uuid, text);
create function public.cancel_booking(p_booking_id uuid, p_reason text, p_mode text default 'auto')
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  b public.bookings%rowtype;
  result jsonb;
  fee numeric;
  refund numeric;
  commission numeric;
  previous_reason text := current_setting('app.audit_reason', true);
begin
  perform public.cancellation_preview(p_booking_id, p_mode);
  lock table public.commission_invoices in share row exclusive mode;
  -- Match payment review's lock order before locking the booking.
  perform id from public.payments where booking_id = p_booking_id and status = 'pending' order by id for update;
  select * into b from public.bookings where id = p_booking_id for update;
  if not found then raise exception 'Booking not found.'; end if;
  result := public.calculate_booking_cancellation(b, p_mode);
  if not (result->>'can_cancel')::boolean then raise exception '%', result->>'error'; end if;
  p_reason := public.require_dashboard_reason(p_reason);
  perform set_config('app.audit_reason', p_reason, true);
  fee := (result->>'fee')::numeric;
  refund := (result->>'refund')::numeric;
  commission := (result->>'commission')::numeric;

  if b.platform_fee_charged and b.commission_amount > commission then
    insert into public.owner_credit_ledger (owner_id, type, amount, booking_id, status, note, created_by)
    values (b.owner_id, 'fee_refund', b.commission_amount - commission, b.id,
            'posted', 'Platform fee adjustment for cancellation', auth.uid());
  end if;

  update public.payments set status = 'rejected',
    rejection_reason = 'Booking cancelled. Reconcile any received transfer with the customer.'
  where booking_id = b.id and status = 'pending';

  update public.bookings set status = 'cancelled', cancelled_at = now(), cancelled_by = auth.uid(),
    cancelled_by_role = result->>'role', cancel_kind = result->>'kind', cancel_reason = p_reason,
    cancel_fee_amount = fee, refund_amount = refund, commission_amount = commission, owner_earnings = fee - commission,
    platform_fee_charged = b.platform_fee_charged and fee > 0,
    deposit_refund_status = case when refund > 0 then 'owed' else 'none' end
  where id = b.id;

  perform set_config('app.audit_reason', coalesce(previous_reason, ''), true);
  return result;
end;
$$;


-- Rejecting payment ends the booking through the same full-refund path.
create or replace function public.reject_booking_payment(p_payment_id uuid, p_reason text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  pending_booking uuid;
begin
  lock table public.commission_invoices in share row exclusive mode;
  select p.booking_id into pending_booking
  from public.payments p join public.bookings b on b.id = p.booking_id join public.owners o on o.id = b.owner_id
  where p.id = p_payment_id and p.status = 'pending' and (o.profile_id = auth.uid() or public.is_admin())
  for update of p;
  if not found then raise exception 'Payment not found or already processed.'; end if;
  perform public.cancel_booking(pending_booking, p_reason, 'full_refund');
end;
$$;

drop function public.mark_deposit_refunded(uuid);
create function public.mark_deposit_refunded(p_booking_id uuid, p_reference text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare
  b public.bookings%rowtype;
begin
  select * into b from public.bookings where id = p_booking_id for update;
  if not found then raise exception 'Booking not found.'; end if;
  if auth.uid() is null or not (public.is_admin() or exists (
    select 1 from public.owners where id = b.owner_id and profile_id = auth.uid()
  )) then raise exception 'Not allowed.'; end if;
  if b.status not in ('cancelled','expired') or b.deposit_refund_status <> 'owed' then
    raise exception 'This booking has no refund waiting to be marked.';
  end if;
  if char_length(btrim(p_reference)) > 80 then raise exception 'Use at most 80 characters for the refund reference.'; end if;
  update public.bookings set deposit_refund_status = 'refunded', refund_reference = nullif(btrim(p_reference), ''),
    refunded_at = now(), payment = case when cancel_fee_amount > 0 then 'partial'::public.payment_status else 'refunded'::public.payment_status end
  where id = b.id;
end;
$$;

revoke all on function public.cancel_booking(uuid,text,text), public.cancellation_preview(uuid,text),
  public.mark_deposit_refunded(uuid,text), public.admin_set_cancellation_override(uuid,integer,numeric) from public, anon;
grant execute on function public.cancel_booking(uuid,text,text), public.cancellation_preview(uuid,text),
  public.mark_deposit_refunded(uuid,text), public.admin_set_cancellation_override(uuid,integer,numeric) to authenticated;

drop trigger audit_owners on public.owners;
create trigger audit_owners after insert or update or delete on public.owners
for each row execute function public.audit_row_change('owner','business_name','business_name,commission_rate,fee_mode,deposit_percent,is_active,payment_qr_verified,archived_at,cancellation_free_hours,cancellation_fee_percent','contact_phone,payment_qr_path,payment_method_label,payment_account_name,gcash_number');

drop trigger audit_bookings on public.bookings;
create trigger audit_bookings after insert or update on public.bookings
for each row execute function public.audit_row_change('booking','reference','status,total_price,commission_amount,owner_earnings,deposit_amount,deposit_refund_status,start_date,end_date,car_id,customer_id,payment,cancel_free_until,cancel_fee_percent,cancelled_at,cancelled_by,cancelled_by_role,cancel_kind,cancel_fee_amount,refund_amount,refunded_at','refund_reference');

create index bookings_pending_refund_idx on public.bookings (owner_id, cancelled_at)
where deposit_refund_status = 'owed';

