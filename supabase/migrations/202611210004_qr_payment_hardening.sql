insert into public.settings (key, value) values
  ('payment_review_hours', '12'), ('payment_resubmit_grace_hours', '2'),
  ('refund_due_days', '3'), ('credit_low_threshold', '200')
on conflict (key) do nothing;

alter table public.bookings
  add column review_due_at timestamptz,
  add column payment_resubmit_due_at timestamptz,
  add column payment_flags text[] not null default '{}';

alter table public.payments
  add column owner_id uuid references public.owners(id),
  add column reference_norm text generated always as (upper(regexp_replace(trim(reference_no), '[^A-Za-z0-9]', '', 'g'))) stored,
  add column proof_sha256 text,
  add column rejected_at timestamptz,
  add column flags text[] not null default '{}',
  add column confirmed_amount numeric(10,2),
  add column confirmed_reference text,
  add column confirmed_channel text check (confirmed_channel in ('owner','admin'));

update public.payments p set owner_id = b.owner_id from public.bookings b where b.id = p.booking_id;
alter table public.payments alter column owner_id set not null;

-- Keep historical collisions intact and visible. New proofs are checked against
-- every active reference, including these historical rows.
with collisions as (
  select id, row_number() over (partition by owner_id, reference_norm order by paid_at, id) as position
  from public.payments where status in ('pending','verified') and reference_norm <> ''
)
update public.payments p set flags = array_append(p.flags, 'duplicate_reference')
from collisions c where c.id = p.id and c.position > 1;

drop index if exists public.payments_reference_unique;
create unique index payments_owner_reference_unique on public.payments (owner_id, reference_norm)
where status in ('pending','verified') and reference_norm <> '' and not ('duplicate_reference' = any(flags));

update public.bookings b set review_due_at = greatest(now(), (
  select max(p.paid_at) from public.payments p where p.booking_id = b.id and p.status = 'pending'
)) + make_interval(hours => coalesce((select (value #>> '{}')::integer from public.settings where key = 'payment_review_hours'),12))
where b.status = 'payment_review';

create index bookings_payment_deadline_idx on public.bookings (greatest(payment_due_at,payment_resubmit_due_at))
where status = 'awaiting_payment';
create index bookings_review_deadline_idx on public.bookings (coalesce(review_due_at,payment_due_at))
where status = 'payment_review';
create index payments_booking_status_idx on public.payments (booking_id,status);

create or replace function public.validate_customer_payment_proof()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  b public.bookings%rowtype;
  normalized text;
begin
  select * into strict b from public.bookings where id = new.booking_id for update;
  new.owner_id := b.owner_id;
  -- Existing pickup-balance RPC records an in-person payment without a proof.
  if new.status = 'verified' then
    if auth.uid() is null or not (public.is_admin() or exists (
      select 1 from public.owners where id = b.owner_id and profile_id = auth.uid()
    )) or b.status not in ('confirmed','picked_up') or new.method = 'owner_qr' then
      raise exception 'Payment cannot be recorded for this booking.';
    end if;
    return new;
  end if;

  if auth.uid() is distinct from b.customer_id then raise exception 'Not allowed.'; end if;
  if b.status not in ('awaiting_payment','payment_review') then raise exception 'Booking is not accepting proofs.'; end if;
  if greatest(b.payment_due_at,b.payment_resubmit_due_at) <= clock_timestamp() then raise exception 'PAYMENT_WINDOW_EXPIRED'; end if;
  if (select count(*) from public.payments where booking_id = b.id) >= 3 then raise exception 'PROOF_LIMIT'; end if;
  if b.status = 'payment_review' then raise exception 'A proof is already under review.'; end if;
  if new.amount is distinct from b.amount_due_now then raise exception 'Enter the exact deposit amount.'; end if;
  normalized := upper(regexp_replace(trim(new.reference_no), '[^A-Za-z0-9]', '', 'g'));
  if normalized is null or length(new.reference_no) > 100 or length(normalized) not between 6 and 40 then raise exception 'REFERENCE_INVALID'; end if;
  if exists (select 1 from public.payments where owner_id = b.owner_id
    and reference_norm = normalized and status in ('pending','verified')) then raise exception 'REFERENCE_ALREADY_USED'; end if;
  if new.proof_path is null or new.proof_path not like b.customer_id::text || '/' || b.id::text || '/%'
    or not exists (select 1 from storage.objects where bucket_id = 'payment-proofs' and name = new.proof_path)
  then raise exception 'Invalid proof file path.'; end if;
  new.status := 'pending';
  new.method := 'owner_qr';
  new.paid_at := clock_timestamp();
  if greatest(b.payment_due_at,b.payment_resubmit_due_at) <= new.paid_at + interval '10 minutes' then
    new.flags := array_append(new.flags,'late_proof');
  end if;
  if (select count(*) from public.payments p join public.bookings prior on prior.id = p.booking_id
      where prior.customer_id = b.customer_id and p.status = 'rejected' and coalesce(p.rejected_at,p.paid_at) > now() - interval '24 hours') >= 2 then
    new.flags := array_append(new.flags,'repeat_rejections');
  end if;
  return new;
end;
$$;

create function public.submit_booking_payment(p_booking_id uuid, p_reference text, p_proof_path text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  payment_id uuid;
  constraint_name text;
begin
  insert into public.payments (booking_id, amount, method, reference_no, proof_path)
  select id, amount_due_now, 'owner_qr', p_reference, p_proof_path from public.bookings
  where id = p_booking_id and customer_id = auth.uid()
  returning id into payment_id;
  if payment_id is null then raise exception 'Not allowed.'; end if;
  return payment_id;
exception when unique_violation then
  get stacked diagnostics constraint_name = CONSTRAINT_NAME;
  if constraint_name = 'payments_owner_reference_unique' then raise exception 'REFERENCE_ALREADY_USED'; end if;
  raise;
end;
$$;

revoke insert (booking_id, amount, method, reference_no, proof_path) on public.payments from authenticated;
drop policy "Admins can manage payments" on public.payments;
create policy "Admins can read payments" on public.payments for select to authenticated using (public.is_admin());

create or replace function public.move_booking_to_payment_review()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.status = 'pending' then
    update public.bookings set status = 'payment_review',
      review_due_at = new.paid_at + make_interval(hours => coalesce(
        (select (value #>> '{}')::integer from public.settings where key = 'payment_review_hours'),12)),
      payment_flags = array(select distinct unnest(payment_flags || new.flags))
    where id = new.booking_id;
  end if;
  return new;
end;
$$;

create or replace function public.confirm_booking_payment(p_payment_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  raise exception 'ATTESTATION_REQUIRED';
end;
$$;

create function public.confirm_booking_payment(
  p_payment_id uuid, p_received_amount numeric, p_received_reference text, p_admin_note text default null
)
returns text language plpgsql security definer set search_path = '' as $$
declare
  p public.payments%rowtype;
  b public.bookings%rowtype;
  o public.owners%rowtype;
  admin_override boolean := public.is_admin();
  credit_balance numeric;
begin
  select b1.* into b from public.bookings b1 join public.payments p1 on p1.booking_id = b1.id
    where p1.id = p_payment_id for update of b1;
  select * into o from public.owners where id = b.owner_id for update;
  if auth.uid() is null or (not admin_override and o.profile_id is distinct from auth.uid())
    then raise exception 'Not allowed.'; end if;
  select * into p from public.payments where id = p_payment_id for update;
  if p.status is distinct from 'pending' or b.status is distinct from 'payment_review' then
    raise exception 'Payment is no longer waiting for review.';
  end if;
  if coalesce(b.review_due_at,b.payment_due_at) <= clock_timestamp()
     and not (admin_override and 'owner_credit_short' = any(b.payment_flags)) then
    raise exception 'PAYMENT_REVIEW_EXPIRED';
  end if;
  if admin_override then
    if coalesce(length(trim(p_admin_note)),0) not between 10 and 300 then raise exception 'ADMIN_NOTE_REQUIRED'; end if;
    p_received_amount := p.amount;
    p_received_reference := p.reference_no;
  elsif p_received_amount is distinct from p.amount or
    nullif(upper(regexp_replace(trim(p_received_reference),'[^A-Za-z0-9]','','g')),'') is distinct from nullif(p.reference_norm,'')
    or nullif(p.reference_norm,'') is null then
    raise exception 'ATTESTATION_MISMATCH';
  end if;

  if o.fee_mode = 'credits' and b.commission_amount > 0 then
    select coalesce(sum(amount),0) into credit_balance from public.owner_credit_ledger where owner_id = o.id and status = 'posted';
    if credit_balance < b.commission_amount and not admin_override then
      if not ('owner_credit_short' = any(b.payment_flags)) then
        update public.bookings set payment_flags = array_append(payment_flags,'owner_credit_short'),
          review_due_at = coalesce(review_due_at,payment_due_at) + interval '12 hours' where id = b.id;
        perform public.notify(o.profile_id,'credits_short','Top up to confirm this booking',
          format('Top up ₱%s to cover the outstanding platform fee.',b.commission_amount-credit_balance),
          '/owner/credits',b.id,'{in_app,email}',true,'credits-short:'||b.id);
        perform public.admin_alert('payment.credit_short','Payment delayed by credit shortage',
          'A deposit needs admin review or an owner top-up.','/admin/payments','credits-short:'||b.id);
      end if;
      return 'CREDITS_SHORT';
    end if;
    insert into public.owner_credit_ledger (owner_id,type,amount,booking_id,status,note,created_by)
    values (o.id,'booking_fee',-b.commission_amount,b.id,'posted','Platform fee for '||b.reference,auth.uid());
  end if;

  update public.payments set status = 'verified', verified_by = auth.uid(), verified_at = now(),
    confirmed_amount = p_received_amount, confirmed_reference = trim(p_received_reference),
    confirmed_channel = case when admin_override then 'admin' else 'owner' end,
    flags = case when admin_override then array_append(flags,'admin_confirmed') else flags end
  where id = p.id;
  update public.payments set status = 'rejected', rejected_at = now(), rejection_reason = 'Another proof was verified for this booking.'
  where booking_id = b.id and status = 'pending';
  update public.bookings set status = 'confirmed', amount_paid_online = p.amount,
    payment = case when p.amount >= total_price then 'paid'::public.payment_status else 'partial'::public.payment_status end,
    platform_fee_charged = o.fee_mode = 'credits' and b.commission_amount > 0,
    payment_flags = case when admin_override then array_append(payment_flags,'admin_confirmed') else payment_flags end
  where id = b.id;
  if admin_override then
    perform public.audit_write('payment.admin_confirmed','payment',p.id::text,b.reference,
      'Confirmed payment on behalf of the owner','{}',p_admin_note);
    perform public.notify(o.profile_id,'payment_admin_confirmed','Deposit confirmed by support',
      'Support confirmed a deposit on your behalf.','/owner/payments',b.id,'{in_app,email}',true,'admin-confirmed:'||b.id);
  end if;
  return 'CONFIRMED';
end;
$$;

create or replace function public.reject_booking_payment(p_payment_id uuid, p_reason text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  b public.bookings%rowtype;
  p public.payments%rowtype;
  reason text := public.require_dashboard_reason(p_reason);
  previous_reason text := current_setting('app.audit_reason',true);
  grace integer;
begin
  select b1.* into b from public.bookings b1 join public.payments p1 on p1.booking_id = b1.id
    where p1.id = p_payment_id for update of b1;
  if auth.uid() is null or not (public.is_admin() or exists (
    select 1 from public.owners where id = b.owner_id and profile_id = auth.uid()
  )) then raise exception 'Not allowed.'; end if;
  select * into p from public.payments where id = p_payment_id for update;
  if p.status is distinct from 'pending' or b.status is distinct from 'payment_review' then
    raise exception 'Payment is no longer waiting for review.';
  end if;
  perform set_config('app.audit_reason', reason, true);
  grace := coalesce((select (value #>> '{}')::integer from public.settings where key = 'payment_resubmit_grace_hours'), 2);
  update public.payments set status = 'rejected', rejected_at = now(), rejection_reason = reason
  where booking_id = b.id and status = 'pending';
  if coalesce(b.review_due_at,b.payment_due_at) <= clock_timestamp() then
    update public.bookings set status = 'expired', deposit_refund_status = 'owed'
    where id = b.id;
  else
    update public.bookings set status = 'awaiting_payment', review_due_at = null,
      payment_resubmit_due_at = greatest(payment_resubmit_due_at, now() + make_interval(hours => grace))
    where id = b.id;
  end if;
  perform set_config('app.audit_reason',coalesce(previous_reason,''),true);
end;
$$;

create or replace function public.expire_unpaid_bookings()
returns integer language plpgsql security definer set search_path = '' as $$
declare
  previous_audit_context text := current_setting('app.audit_actor',true);
  b public.bookings%rowtype;
  affected integer := 0;
begin
  perform set_config('app.audit_actor','cron:expire_unpaid_bookings',true);
  for b in select * from public.bookings
    where (status = 'awaiting_payment' and greatest(payment_due_at,payment_resubmit_due_at) <= now())
      or (status = 'payment_review' and coalesce(review_due_at,payment_due_at) <= now())
    order by id for update skip locked
  loop
    update public.payments set status = 'rejected', rejected_at = now(),
      rejection_reason = 'Payment review expired. Reconcile any received transfer with the customer.'
    where booking_id = b.id and status = 'pending';
    update public.bookings set status = 'expired',
      deposit_refund_status = case when b.status = 'payment_review' then 'owed' else deposit_refund_status end,
      payment_flags = case when b.status = 'payment_review' and not ('owner_no_response' = any(payment_flags))
        then array_append(payment_flags,'owner_no_response') else payment_flags end
    where id = b.id;
    affected := affected + 1;
  end loop;
  perform set_config('app.audit_actor',coalesce(previous_audit_context,''),true);
  return affected;
end;
$$;

create or replace view public.public_car_booking_dates with (security_barrier = true) as
select b.car_id,b.start_date,b.end_date from public.bookings b join public.cars c on c.id = b.car_id and c.is_active
where b.status in ('confirmed','picked_up')
   or (b.status = 'awaiting_payment' and greatest(b.payment_due_at,b.payment_resubmit_due_at) > now())
   or (b.status = 'payment_review' and coalesce(b.review_due_at,b.payment_due_at) > now());

revoke all on function public.validate_customer_payment_proof(), public.move_booking_to_payment_review(),
  public.expire_unpaid_bookings(), public.confirm_booking_payment(uuid), public.confirm_booking_payment(uuid,numeric,text,text),
  public.reject_booking_payment(uuid,text), public.submit_booking_payment(uuid,text,text) from public, anon, authenticated;
grant execute on function public.confirm_booking_payment(uuid), public.confirm_booking_payment(uuid,numeric,text,text),
  public.reject_booking_payment(uuid,text), public.submit_booking_payment(uuid,text,text) to authenticated;

-- Use the booking-first lock order shared by review, expiry and submission.
create or replace function public.cancel_booking(p_booking_id uuid, p_reason text, p_mode text default 'auto')
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

  update public.payments set status = 'rejected', rejected_at = now(),
    rejection_reason = 'Booking cancelled. Reconcile any received transfer with the customer.'
  where booking_id = b.id and status = 'pending';

  update public.bookings set status = 'cancelled', cancelled_at = now(), cancelled_by = auth.uid(),
    cancelled_by_role = result->>'role', cancel_kind = result->>'kind', cancel_reason = p_reason,
    cancel_fee_amount = fee, refund_amount = refund, commission_amount = commission, owner_earnings = fee - commission,
    platform_fee_charged = b.platform_fee_charged and fee > 0,
    deposit_refund_status = case when refund > 0 or b.status = 'payment_review' then 'owed' else 'none' end
  where id = b.id;

  perform set_config('app.audit_reason', coalesce(previous_reason, ''), true);
  return result;
end;
$$;



insert into public.admin_alert_rules (event_key,label,description,mode,default_mode) values
  ('payment.risk','Payment risk','A payment needs additional review.','digest','digest'),
  ('payment.credit_short','Owner credits short','A shortage is delaying a payment confirmation.','instant','instant'),
  ('payment.review_overdue','Payment review overdue','A proof is waiting for owner action.','instant','instant'),
  ('payment.no_response','Payment review expired','An owner did not act before the review deadline.','instant','instant'),
  ('payment.dispute','Payment dispute','A payment or refund was disputed.','instant','instant'),
  ('payment.refund_overdue','Refund overdue','A refund is at least two days overdue.','instant','instant');

create table public.payment_request_limits (
  scope text not null,
  caller text not null,
  bucket timestamptz not null,
  requests integer not null,
  primary key (scope, caller, bucket)
);
alter table public.payment_request_limits enable row level security;
revoke all on public.payment_request_limits from public, anon, authenticated;

create function public.take_payment_request(p_scope text, p_caller text)
returns boolean language plpgsql security definer set search_path = '' as $$
declare
  request_count integer;
  current_bucket timestamptz := date_trunc('minute', now());
begin
  if p_scope not in ('fingerprint','receipt') or p_caller is null or char_length(p_caller) > 64 then
    return false;
  end if;
  insert into public.payment_request_limits as limits values (p_scope,p_caller,current_bucket,1)
  on conflict (scope,caller,bucket) do update set requests = least(limits.requests + 1,61)
  returning requests into request_count;
  return request_count <= case when p_scope = 'fingerprint' then 60 else 25 end;
end;
$$;

create index payments_non_rejected_proof_hash on public.payments (proof_sha256)
where status in ('pending','verified') and proof_sha256 is not null;

create function public.set_payment_proof_hash(p_payment_id uuid, p_sha256 text)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  if p_sha256 is null or p_sha256 !~ '^[0-9a-f]{64}$' then raise exception 'Invalid proof hash.'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_sha256,0));
  perform b.id from public.bookings b
  where exists (select 1 from public.payments p where p.booking_id = b.id
    and (p.id = p_payment_id or (p.proof_sha256 = p_sha256 and p.status in ('pending','verified'))))
  order by b.id for update;
  update public.payments set proof_sha256 = p_sha256
    where id = p_payment_id and status = 'pending' and proof_sha256 is null;
  if not found then return false; end if;
  if exists (select 1 from public.payments where id <> p_payment_id
      and proof_sha256 = p_sha256 and status in ('pending','verified')) then
    update public.payments set flags = array_append(flags,'duplicate_proof')
      where proof_sha256 = p_sha256 and status in ('pending','verified') and not ('duplicate_proof' = any(flags));
    update public.bookings b set payment_flags = array_append(payment_flags,'duplicate_proof')
      where not ('duplicate_proof' = any(payment_flags)) and exists (
        select 1 from public.payments p where p.booking_id = b.id
          and p.proof_sha256 = p_sha256 and p.status in ('pending','verified')
      );
    perform public.admin_alert('payment.risk','Payment screenshot reused',
      'Matching proof images need review.','/admin/payments','duplicate-proof:'||p_sha256);
  end if;
  return true;
end;
$$;
revoke all on function public.take_payment_request(text,text), public.set_payment_proof_hash(uuid,text)
  from public, anon, authenticated;
grant execute on function public.take_payment_request(text,text), public.set_payment_proof_hash(uuid,text) to service_role;

create function public.calculate_owner_credit_state(p_owner_id uuid)
returns table (balance numeric, pending_fees numeric, available numeric, low_threshold numeric)
language sql stable security definer set search_path = '' as $$
  with amounts as (
    select
      coalesce((select sum(l.amount) from public.owner_credit_ledger l where l.owner_id = p_owner_id and l.status = 'posted'),0) as balance,
      coalesce((select sum(b.commission_amount) from public.bookings b where b.owner_id = p_owner_id
        and b.status in ('awaiting_payment','payment_review')),0) as pending_fees,
      greatest(coalesce((select (value #>> '{}')::numeric from public.settings where key = 'credit_low_threshold'),200),
        coalesce((select 2 * avg(b.commission_amount) from public.bookings b where b.owner_id = p_owner_id
          and b.status in ('confirmed','picked_up','returned','completed') and b.created_at > now() - interval '30 days'),0)) as low_threshold
  )
  select balance,pending_fees,balance-pending_fees,low_threshold from amounts
$$;

create function public.owner_credit_state(p_owner_id uuid)
returns table (balance numeric, pending_fees numeric, available numeric, low_threshold numeric)
language sql stable security definer set search_path = '' as $$
  select s.* from public.calculate_owner_credit_state(p_owner_id) s
  where auth.uid() is not null and (public.is_admin() or exists (
    select 1 from public.owners where id = p_owner_id and profile_id = auth.uid()))
$$;

-- Keep the existing public listing predicate's signature. The actual booking
-- check also requires enough available credit for the computed commission.
create or replace function public.owner_can_accept(p_owner_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce(o.is_active and o.payment_qr_verified and case o.fee_mode
    when 'credits' then (select available from public.calculate_owner_credit_state(o.id)) >=
      coalesce((select (value #>> '{}')::numeric from public.settings where key = 'min_credit_to_list'),500)
    else not exists (select 1 from public.commission_invoices i where i.owner_id = o.id
      and i.status = 'unpaid' and i.due_date < (now() at time zone 'Asia/Manila')::date)
    end,false)
  from public.owners o where o.id = p_owner_id
$$;

revoke all on function public.calculate_owner_credit_state(uuid), public.owner_credit_state(uuid)
  from public, anon, authenticated;
grant execute on function public.owner_credit_state(uuid) to authenticated;

create or replace function public.set_booking_owner_and_earnings()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  booking_rate numeric(10,2);
  booking_deposit numeric(10,2);
  booking_commission numeric(5,4);
  owner_uuid uuid;
  deposit_fraction numeric(4,3);
  window_hours numeric;
  selected_fee_mode text;
  available_credits numeric;
begin
  select c.owner_id, o.commission_rate, r.daily_rate, r.deposit_amount, o.deposit_percent, o.fee_mode
  into owner_uuid, booking_commission, booking_rate, booking_deposit, deposit_fraction, selected_fee_mode
  from public.cars c
  join public.owners o on o.id = c.owner_id
  join public.car_rates r on r.car_id = c.id and r.mode = new.mode
  where c.id = new.car_id and c.is_active
    and ((new.mode = 'self_drive' and c.allows_self_drive) or (new.mode = 'with_driver' and c.allows_with_driver))
  -- Serialize admission and fee posting for this owner across different cars.
  for update of o;

  if not found or not public.owner_can_accept(owner_uuid) then
    raise exception 'This car is unavailable for bookings. Please choose another listing.';
  end if;
  if new.end_date < new.start_date then raise exception 'End date must be on or after start date.'; end if;

  if exists (
    select 1 from public.car_blocked_dates d
    where d.car_id = new.car_id
      and daterange(d.start_date, d.end_date, '[]') && daterange(new.start_date, new.end_date, '[]')
  ) then raise exception 'This car is blocked for one or more selected dates.'; end if;

  select coalesce((s.value #>> '{}')::numeric, 0.30) into window_hours
  from public.settings s where s.key = 'payment_window_hours';
  window_hours := coalesce(window_hours, 24);
  if window_hours < 1 or window_hours > 168 then window_hours := 24; end if;
  select coalesce(deposit_fraction, (s.value #>> '{}')::numeric, 0.30) into deposit_fraction
  from public.settings s where s.key = 'deposit_percent';
  deposit_fraction := greatest(0.1, least(1, coalesce(deposit_fraction, 0.30)));

  new.owner_id := owner_uuid;
  new.days := greatest(1, new.end_date - new.start_date);
  new.daily_rate := booking_rate;
  new.total_price := booking_rate * new.days;
  new.deposit_amount := case when new.mode = 'self_drive' then booking_deposit else 0 end;
  new.commission_rate := booking_commission;
  new.commission_amount := round(new.total_price * booking_commission, 2);
  if selected_fee_mode = 'credits' then
    select available into available_credits from public.calculate_owner_credit_state(owner_uuid);
    if available_credits < new.commission_amount then raise exception 'This owner cannot accept another booking right now.'; end if;
  end if;
  new.owner_earnings := new.total_price - new.commission_amount;
  new.amount_due_now := round(new.total_price * deposit_fraction, 2);
  new.balance_at_pickup := new.total_price - new.amount_due_now;
  new.payment_due_at := now() + make_interval(hours => window_hours::integer);
  new.status := 'awaiting_payment';
  new.payment := case when new.amount_due_now >= new.total_price then 'paid'::public.payment_status else 'unpaid'::public.payment_status end;
  return new;
end;
$$;

create or replace view public.owner_payment_settings with (security_barrier = true) as
select key,value from public.settings
where key in ('platform_account_name','platform_qr_path','payment_instructions','min_credit_to_list');

-- Release stale holds before checking the owner's available credits.
alter trigger expire_booking_holds_before_insert on public.bookings rename to a_expire_booking_holds_before_insert;

drop policy "Customers can read cars in own bookings" on public.cars;
create policy "Customers can read cars in own bookings" on public.cars for select to authenticated using (
  exists (select 1 from public.bookings b where b.car_id = cars.id and b.customer_id = (select auth.uid()))
);

create table public.booking_refunds (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null unique references public.bookings(id) on delete cascade,
  owner_id uuid not null references public.owners(id),
  customer_id uuid not null references public.profiles(id),
  amount numeric(10,2) not null check (amount > 0),
  status text not null default 'owed' check (status in ('owed','refunded','disputed','waived')),
  due_at timestamptz not null,
  refunded_at timestamptz,
  refund_reference text check (char_length(refund_reference) <= 80),
  refund_proof_path text,
  note text check (char_length(note) <= 300),
  created_at timestamptz not null default now()
);
alter table public.booking_refunds enable row level security;
revoke all on public.booking_refunds from public, anon, authenticated;
grant select on public.booking_refunds to authenticated;
create policy "Read related refunds" on public.booking_refunds for select to authenticated
using (customer_id = (select auth.uid()) or (select public.is_admin()) or exists (
  select 1 from public.owners o where o.id = booking_refunds.owner_id and o.profile_id = (select auth.uid())));
create index booking_refunds_due_idx on public.booking_refunds (due_at) where status = 'owed';

insert into public.booking_refunds (booking_id,owner_id,customer_id,amount,status,due_at,refunded_at,refund_reference,created_at)
select id,owner_id,customer_id,coalesce(nullif(refund_amount,0),nullif(amount_paid_online,0),amount_due_now),
  deposit_refund_status,coalesce(cancelled_at,now()) + interval '3 days',refunded_at,refund_reference,coalesce(cancelled_at,now())
from public.bookings where deposit_refund_status in ('owed','refunded')
  and coalesce(nullif(refund_amount,0),nullif(amount_paid_online,0),amount_due_now) > 0;

create function public.track_booking_refund()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  owner_user uuid;
begin
  if new.deposit_refund_status = 'owed' and old.deposit_refund_status is distinct from 'owed' then
    insert into public.booking_refunds (booking_id,owner_id,customer_id,amount,due_at)
    select new.id,new.owner_id,new.customer_id,amount,
      now() + make_interval(days => coalesce((select (value #>> '{}')::integer from public.settings where key = 'refund_due_days'),3))
    from (select coalesce(nullif(new.refund_amount,0),nullif(new.amount_paid_online,0),new.amount_due_now) as amount) r
    where amount > 0 on conflict (booking_id) do nothing;
    if found then
      select profile_id into owner_user from public.owners where id = new.owner_id;
      perform public.notify(owner_user,'refund_owed','Refund to reconcile',
        'Check the transfer and record the refund by the deadline shown in your payment dashboard.',
        '/owner/payments?tab=refunds',new.id,'{in_app,email}',true,'refund-owed:'||new.id);
    end if;
  end if;
  return new;
end;
$$;
create trigger track_booking_refund after update of deposit_refund_status on public.bookings
for each row execute function public.track_booking_refund();

create function public.sync_booking_refund()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.status = old.status then return new; end if;
  update public.bookings set
    deposit_refund_status = case new.status when 'refunded' then 'refunded' when 'waived' then 'none' else 'owed' end,
    refunded_at = new.refunded_at, refund_reference = new.refund_reference,
    payment = case when new.status = 'refunded' and amount_paid_online > 0 then
      case when cancel_fee_amount > 0 then 'partial'::public.payment_status else 'refunded'::public.payment_status end
      else payment end
  where id = new.booking_id;
  return new;
end;
$$;
create trigger sync_booking_refund after update of status on public.booking_refunds
for each row execute function public.sync_booking_refund();

insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values ('refund-proofs','refund-proofs',false,5242880,array['image/jpeg','image/png','image/webp']);
update storage.buckets set file_size_limit = 5242880 where id = 'payment-proofs';

create policy "Upload refund proof" on storage.objects for insert to authenticated with check (
  bucket_id = 'refund-proofs' and (storage.foldername(name))[1] = (select auth.uid())::text
  and exists (select 1 from public.booking_refunds r join public.owners o on o.id = r.owner_id
    where r.booking_id::text = (storage.foldername(name))[2] and r.status in ('owed','disputed')
      and (o.profile_id = (select auth.uid()) or (select public.is_admin()))));
create policy "Read related refund proof" on storage.objects for select to authenticated using (
  bucket_id = 'refund-proofs' and exists (select 1 from public.booking_refunds r where r.refund_proof_path = name));
create function public.mark_booking_refunded(p_booking_id uuid, p_reference text, p_proof_path text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  r public.booking_refunds%rowtype;
begin
  perform id from public.bookings where id = p_booking_id for update;
  select * into r from public.booking_refunds where booking_id = p_booking_id for update;
  if auth.uid() is null or not (public.is_admin() or exists (
    select 1 from public.owners where id = r.owner_id and profile_id = auth.uid()
  )) then raise exception 'Not allowed.'; end if;
  if r.status is distinct from 'owed' and r.status is distinct from 'disputed' then raise exception 'Refund is not pending.'; end if;
  if coalesce(length(trim(p_reference)),0) not between 1 and 80 then raise exception 'Enter a refund reference.'; end if;
  if p_proof_path is null or p_proof_path not like auth.uid()::text || '/' || p_booking_id::text || '/%'
    or not exists (select 1 from storage.objects where bucket_id = 'refund-proofs' and name = p_proof_path)
    then raise exception 'Upload refund proof first.'; end if;
  update public.booking_refunds set status = 'refunded', refunded_at = now(),
    refund_reference = trim(p_reference), refund_proof_path = p_proof_path where id = r.id;
end;
$$;

create or replace function public.mark_deposit_refunded(p_booking_id uuid, p_reference text default null)
returns void language plpgsql security definer set search_path = '' as $$
begin
  raise exception 'REFUND_PROOF_REQUIRED';
end;
$$;

create function public.admin_waive_booking_refund(p_booking_id uuid, p_reason text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  reason text := public.require_dashboard_reason(p_reason);
begin
  if auth.uid() is null or not public.is_admin() then raise exception 'Not allowed.'; end if;
  perform id from public.bookings where id = p_booking_id for update;
  update public.booking_refunds set status = 'waived', note = reason
    where booking_id = p_booking_id and status in ('owed','disputed');
  if not found then raise exception 'Refund is not pending.'; end if;
  perform public.audit_write('refund.waived','booking',p_booking_id::text,null,'Waived a booking refund','{}',reason);
end;
$$;

revoke all on function public.track_booking_refund(), public.sync_booking_refund(),
  public.mark_deposit_refunded(uuid,text), public.mark_booking_refunded(uuid,text,text),
  public.admin_waive_booking_refund(uuid,text) from public, anon, authenticated;
grant execute on function public.mark_booking_refunded(uuid,text,text), public.admin_waive_booking_refund(uuid,text) to authenticated;

create table public.payment_disputes (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings(id) on delete cascade,
  opened_by uuid not null references public.profiles(id),
  kind text not null check (kind in ('paid_not_confirmed','wrong_amount','refund_not_received','other')),
  message text not null check (char_length(message) between 10 and 1000),
  owner_reply text check (char_length(owner_reply) <= 300),
  status text not null default 'open' check (status in ('open','resolved','rejected')),
  resolution text check (char_length(resolution) <= 500),
  resolved_by uuid references public.profiles(id),
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);
create unique index payment_disputes_one_open on public.payment_disputes (booking_id,kind) where status = 'open';
alter table public.payment_disputes enable row level security;
revoke all on public.payment_disputes from public, anon, authenticated;
grant select on public.payment_disputes to authenticated;
create policy "Read related disputes" on public.payment_disputes for select to authenticated
using (opened_by = (select auth.uid()) or (select public.is_admin()) or exists (
  select 1 from public.bookings b join public.owners o on o.id = b.owner_id
  where b.id = payment_disputes.booking_id and o.profile_id = (select auth.uid())));

create function public.open_payment_dispute(p_booking uuid, p_kind text, p_message text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  b public.bookings%rowtype;
  owner_user uuid;
  dispute_id uuid;
  first_dispute boolean;
begin
  select * into b from public.bookings where id = p_booking and customer_id = auth.uid() for update;
  if not found then raise exception 'Not allowed.'; end if;
  if p_kind = 'refund_not_received' then
    update public.booking_refunds set status = 'disputed' where booking_id = b.id and status = 'refunded';
    if not found then raise exception 'A sent refund is required.'; end if;
  elsif p_kind = 'paid_not_confirmed' and b.status in ('confirmed','picked_up','returned','completed') then
    raise exception 'This reservation payment is already confirmed.';
  elsif not exists (select 1 from public.payments where booking_id = b.id and method = 'owner_qr'
    and (status = 'rejected' or status = 'verified' or paid_at <= now() - interval '2 hours'))
    and not (b.status = 'expired' or (b.status = 'awaiting_payment' and greatest(b.payment_due_at,b.payment_resubmit_due_at) <= now())) then
    raise exception 'Disputes are available two hours after submitting proof, or after rejection or expiry.';
  end if;
  first_dispute := not exists (select 1 from public.payment_disputes where booking_id = b.id);
  insert into public.payment_disputes (booking_id,opened_by,kind,message)
    values (b.id,auth.uid(),p_kind,trim(p_message)) returning id into dispute_id;
  if first_dispute and b.status = 'payment_review' then
    update public.bookings set review_due_at = greatest(review_due_at,now() + interval '24 hours') where id = b.id;
  elsif first_dispute and b.status = 'awaiting_payment'
    and greatest(b.payment_due_at,b.payment_resubmit_due_at) > now() then
    update public.bookings set payment_resubmit_due_at = greatest(payment_resubmit_due_at,now() + interval '24 hours') where id = b.id;
  end if;
  select profile_id into owner_user from public.owners where id = b.owner_id;
  perform public.notify(owner_user,'payment_dispute','Payment dispute opened',
    'A customer has asked support to review a payment.','/owner/payments?tab=disputes',b.id,'{in_app,email}',true,'dispute:'||dispute_id);
  perform public.notify(b.customer_id,'payment_dispute','Payment dispute opened',
    'Support will review your dispute.','/account/bookings#trip-'||b.id,b.id,'{in_app,email}',true,'dispute:'||dispute_id);
  perform public.notify_admins('payment_dispute','Payment dispute opened','A payment or refund needs review.',
    '/admin/payments','{in_app}',true,'dispute:'||dispute_id);
  perform public.admin_alert('payment.dispute','Payment dispute opened','A payment or refund needs review.',
    '/admin/payments','dispute:'||dispute_id);
  return dispute_id;
end;
$$;

create function public.owner_reply_payment_dispute(p_dispute_id uuid, p_reply text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if coalesce(length(trim(p_reply)),0) not between 1 and 300 then raise exception 'Enter a reply of at most 300 characters.'; end if;
  update public.payment_disputes d set owner_reply = trim(p_reply)
  from public.bookings b join public.owners o on o.id = b.owner_id
  where d.id = p_dispute_id and d.status = 'open' and d.booking_id = b.id and o.profile_id = auth.uid();
  if not found then raise exception 'Dispute is unavailable.'; end if;
end;
$$;

create function public.admin_resolve_payment_dispute(p_dispute_id uuid, p_upheld boolean, p_resolution text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  d public.payment_disputes%rowtype;
  owner_user uuid;
begin
  if auth.uid() is null or not public.is_admin() then raise exception 'Not allowed.'; end if;
  if p_upheld is null or coalesce(length(trim(p_resolution)),0) not between 10 and 500 then raise exception 'Enter a resolution of 10 to 500 characters.'; end if;
  update public.payment_disputes set status = case when p_upheld then 'resolved' else 'rejected' end,
    resolution = trim(p_resolution), resolved_by = auth.uid(), resolved_at = now()
  where id = p_dispute_id and status = 'open' returning * into d;
  if not found then raise exception 'Dispute is not open.'; end if;
  perform public.audit_write('payment.dispute_resolved','booking',d.booking_id::text,null,'Resolved a payment dispute',
    jsonb_build_object('status',d.status),p_resolution);
  select o.profile_id into owner_user from public.bookings b join public.owners o on o.id = b.owner_id where b.id = d.booking_id;
  perform public.notify(owner_user,'payment_dispute_resolved','Payment dispute resolved',
    'Support recorded a decision. Open the dispute to read it.','/owner/payments?tab=disputes',d.booking_id,'{in_app,email}',true,'dispute-resolved:'||d.id);
  perform public.notify(d.opened_by,'payment_dispute_resolved','Payment dispute resolved',
    'Support recorded a decision. Open the dispute to read it.','/account/bookings#trip-'||d.booking_id,d.booking_id,'{in_app,email}',true,'dispute-resolved:'||d.id);
  perform public.notify_admins('payment_dispute_resolved','Payment dispute resolved',
    'A decision was recorded.','/admin/payments','{in_app}',false,'dispute-resolved:'||d.id);
end;
$$;

revoke all on function public.open_payment_dispute(uuid,text,text), public.owner_reply_payment_dispute(uuid,text),
  public.admin_resolve_payment_dispute(uuid,boolean,text) from public, anon, authenticated;
grant execute on function public.open_payment_dispute(uuid,text,text), public.owner_reply_payment_dispute(uuid,text),
  public.admin_resolve_payment_dispute(uuid,boolean,text) to authenticated;

create sequence public.receipt_seq;
revoke all on sequence public.receipt_seq from public, anon, authenticated;
create table public.payment_receipts (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid not null unique references public.payments(id),
  booking_id uuid not null references public.bookings(id),
  receipt_no text not null unique,
  public_code text not null unique default replace(gen_random_uuid()::text,'-',''),
  status text not null default 'valid' check (status in ('valid','voided','refunded')),
  details jsonb not null,
  created_at timestamptz not null default now()
);
alter table public.payment_receipts enable row level security;
revoke all on public.payment_receipts from public, anon, authenticated;
grant select on public.payment_receipts to authenticated;
grant select on public.payment_receipts to service_role;
create policy "Read related payment confirmations" on public.payment_receipts for select to authenticated
using (exists (select 1 from public.bookings b where b.id = payment_receipts.booking_id
  and (b.customer_id = (select auth.uid()) or exists (
    select 1 from public.owners o where o.id = b.owner_id and o.profile_id = (select auth.uid())))));

create function public.issue_payment_receipt()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  next_number text;
  b public.bookings%rowtype;
  confirmation_id uuid;
begin
  if old.status = 'verified' or new.status <> 'verified' or new.confirmed_channel is null then return new; end if;
  select * into strict b from public.bookings where id = new.booking_id;
  next_number := nextval('public.receipt_seq')::text;
  insert into public.payment_receipts (payment_id,booking_id,receipt_no,details,created_at)
  select new.id,b.id,'KB-'||to_char(new.verified_at at time zone 'Asia/Manila','YYYY')||'-'||lpad(next_number,greatest(6,length(next_number)),'0'),
    jsonb_build_object('booking_reference',b.reference,'owner_name',o.business_name,
      'customer_name',customer.full_name,'vehicle',concat_ws(' ',c.brand,c.model),'start_date',b.start_date,'end_date',b.end_date,
      'mode',b.mode,'pickup',coalesce(pickup.address,b.pickup_location),'amount',new.amount,'balance',b.balance_at_pickup,
      'safety_deposit',case when b.mode = 'self_drive' then b.deposit_amount else null end,
      'channel',coalesce(nullif(o.payment_method_label,''),'Owner QR')),
    new.verified_at
  from public.owners o, public.cars c, public.profiles customer
  left join public.pickup_locations pickup on pickup.id = b.pickup_location_id and pickup.owner_id = b.owner_id
  where o.id = b.owner_id and c.id = b.car_id and customer.id = b.customer_id
  returning id into strict confirmation_id;
  perform public.notify(b.customer_id,'booking_payment_confirmation','Booking payment confirmation',
    'Your reservation payment confirmation is available.','/api/receipts/'||confirmation_id||'/pdf',b.id,
    '{in_app,email}',true,'receipt:'||confirmation_id);
  return new;
end;
$$;
create trigger issue_payment_receipt after update of status on public.payments
for each row execute function public.issue_payment_receipt();

create function public.sync_payment_receipt_status()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.deposit_refund_status = 'refunded' then
    update public.payment_receipts set status = 'refunded' where booking_id = new.id and status <> 'refunded';
  elsif new.status in ('cancelled','expired') then
    update public.payment_receipts set status = 'voided' where booking_id = new.id and status <> 'refunded';
  end if;
  return new;
end;
$$;
create trigger sync_payment_receipt_status after update of status,deposit_refund_status on public.bookings
for each row execute function public.sync_payment_receipt_status();

create function public.public_payment_confirmation(p_code text)
returns table (receipt_no text,status text,created_at timestamptz,amount numeric,vehicle text,owner_name text)
language sql stable security definer set search_path = '' as $$
  select r.receipt_no,r.status,r.created_at,(r.details->>'amount')::numeric,r.details->>'vehicle',r.details->>'owner_name'
  from public.payment_receipts r where r.public_code = p_code
$$;

revoke all on function public.issue_payment_receipt(), public.sync_payment_receipt_status(),
  public.public_payment_confirmation(text) from public, anon, authenticated;
grant execute on function public.public_payment_confirmation(text) to service_role;

create table public.owner_payment_events (
  id bigint generated always as identity primary key,
  owner_id uuid not null references public.owners(id) on delete cascade,
  booking_id uuid references public.bookings(id) on delete set null,
  kind text not null check (kind in ('confirmed','rejected','no_response','refund_overdue','refund_done','dispute_opened','dispute_upheld')),
  seconds_to_act integer,
  created_at timestamptz not null default now()
);
create index owner_payment_events_recent_idx on public.owner_payment_events (owner_id,created_at);
create unique index owner_payment_refund_overdue_once on public.owner_payment_events (booking_id)
where kind = 'refund_overdue';
alter table public.owner_payment_events enable row level security;
revoke all on public.owner_payment_events from public, anon, authenticated;
grant select on public.owner_payment_events to authenticated;
create policy "Admins read payment events" on public.owner_payment_events for select to authenticated using ((select public.is_admin()));

create view public.owner_payment_stats with (security_invoker = true) as
select owner_id,
  count(*) filter (where kind = 'confirmed') as confirmed,
  count(*) filter (where kind = 'no_response') as no_response,
  count(*) filter (where kind = 'refund_overdue') as refunds_overdue,
  percentile_cont(0.5) within group (order by seconds_to_act)
    filter (where kind in ('confirmed','rejected')) as median_seconds_to_act
from public.owner_payment_events where created_at > now() - interval '90 days' group by owner_id;
revoke all on public.owner_payment_stats from public, anon, authenticated;
grant select on public.owner_payment_stats to authenticated;

create function public.owner_payment_performance(p_owner_id uuid)
returns setof public.owner_payment_stats language sql stable security definer set search_path = '' as $$
  select * from public.owner_payment_stats where owner_id = p_owner_id and auth.uid() is not null
    and (public.is_admin() or exists (select 1 from public.owners where id = p_owner_id and profile_id = auth.uid()))
$$;

create function public.record_payment_performance()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  owner_key uuid;
  booking_key uuid;
  event_kind text;
  elapsed integer;
begin
  if tg_table_name = 'payments' then
    if old.status <> 'pending' or new.status not in ('verified','rejected') then return new; end if;
    if new.status = 'rejected' and (new.rejection_reason in (
      'Another proof was verified for this booking.',
      'Booking cancelled. Reconcile any received transfer with the customer.',
      'Payment review expired. Reconcile any received transfer with the customer.'
    )) then return new; end if;
    owner_key := new.owner_id;
    booking_key := new.booking_id;
    event_kind := case when new.status = 'verified' then 'confirmed' else 'rejected' end;
    elapsed := greatest(0,extract(epoch from now() - new.paid_at)::integer);
  elsif tg_table_name = 'bookings' then
    if not ('owner_no_response' = any(new.payment_flags)) or 'owner_no_response' = any(old.payment_flags) then return new; end if;
    owner_key := new.owner_id;
    booking_key := new.id;
    event_kind := 'no_response';
    perform public.admin_alert('payment.no_response','Payment review expired',
      'The booking was released and the refund must be reconciled.','/admin/payments','no-response:'||booking_key);
  elsif tg_table_name = 'booking_refunds' then
    if new.status <> 'refunded' or old.status = new.status then return new; end if;
    owner_key := new.owner_id;
    booking_key := new.booking_id;
    event_kind := 'refund_done';
  else
    if tg_op = 'UPDATE' and (new.status <> 'resolved' or old.status = new.status) then return new; end if;
    select owner_id into owner_key from public.bookings where id = new.booking_id;
    booking_key := new.booking_id;
    event_kind := case when tg_op = 'INSERT' then 'dispute_opened' else 'dispute_upheld' end;
  end if;
  insert into public.owner_payment_events(owner_id,booking_id,kind,seconds_to_act)
  values (owner_key,booking_key,event_kind,elapsed);
  return new;
end;
$$;
create trigger record_payment_performance after update of status on public.payments
for each row execute function public.record_payment_performance();
create trigger record_no_response after update of payment_flags on public.bookings
for each row execute function public.record_payment_performance();
create trigger record_refund_performance after update of status on public.booking_refunds
for each row execute function public.record_payment_performance();
create trigger record_dispute_performance after insert or update of status on public.payment_disputes
for each row execute function public.record_payment_performance();

create or replace function public.send_refund_reminders()
returns void language plpgsql security definer set search_path = '' as $$
declare
  r record;
  day_key text := (now() at time zone 'Asia/Manila')::date::text;
begin
  for r in select f.*,o.profile_id from public.booking_refunds f join public.owners o on o.id = f.owner_id
    where f.status = 'owed' and f.due_at <= now() + interval '1 day' for share of f skip locked
  loop
    perform public.notify(r.profile_id,'refund_reminder',
      case when r.due_at <= now() then 'Refund overdue' else 'Refund due soon' end,
      'Review and record the refund from your payment dashboard.','/owner/payments?tab=refunds',r.booking_id,
      '{in_app,email}',true,'refund-reminder:'||r.id||':'||case when r.due_at <= now() then day_key else 'due-soon' end);
    if r.due_at <= now() then
      insert into public.owner_payment_events(owner_id,booking_id,kind) values (r.owner_id,r.booking_id,'refund_overdue')
      on conflict do nothing;
    end if;
    if r.due_at <= now() - interval '2 days' then
      perform public.admin_alert('payment.refund_overdue','Booking refund overdue',
        'An owner refund is two or more days overdue.','/admin/payments','refund-overdue:'||r.id||':'||day_key);
    end if;
  end loop;
end;
$$;

create function public.send_payment_review_reminders()
returns void language plpgsql security definer set search_path = '' as $$
declare
  r record;
  today date := (now() at time zone 'Asia/Manila')::date;
begin
  delete from public.payment_request_limits where bucket < now() - interval '1 day';
  perform public.send_refund_reminders();
  for r in select b.id,b.review_due_at,p.id as payment_id,p.paid_at,o.profile_id
    from public.bookings b join public.payments p on p.booking_id = b.id and p.status = 'pending'
    join public.owners o on o.id = b.owner_id
    where b.status = 'payment_review' and b.review_due_at > now() and p.paid_at <= now() - interval '1 hour'
    for share of b skip locked
  loop
    perform public.notify(r.profile_id,'payment_review_reminder','Payment proof waiting',
      'Check your wallet or bank app and review the proof.','/owner/payments',r.id,'{in_app,push}',true,'review-1h:'||r.payment_id);
    if r.paid_at <= now() - interval '4 hours' then
      perform public.notify(r.profile_id,'payment_review_reminder','Payment review still waiting',
        'Check the transfer and act before the review deadline.','/owner/payments',r.id,'{in_app,push,email}',true,'review-4h:'||r.payment_id);
    end if;
    if r.paid_at <= now() - interval '8 hours' then
      perform public.admin_alert('payment.review_overdue','Payment proof waiting eight hours',
        'Check the pending proof and follow up with the owner.','/admin/payments','review-8h:'||r.payment_id);
    end if;
  end loop;

  for r in select o.id,o.profile_id,s.available,s.low_threshold
    from public.owners o cross join lateral public.calculate_owner_credit_state(o.id) s
    where o.is_active and o.fee_mode = 'credits' and (s.available <= 0 or s.available < s.low_threshold)
  loop
    perform public.notify(r.profile_id,case when r.available <= 0 then 'credits_empty' else 'credits_low' end,
      case when r.available <= 0 then 'Owner credits unavailable' else 'Owner credits running low' end,
      'Check your available balance and top up from your credits dashboard.','/owner/credits',null,
      '{in_app,email}',false,'credits-low:'||r.id||':'||today);
  end loop;

  for r in select i.id,i.due_date,o.profile_id from public.commission_invoices i join public.owners o on o.id = i.owner_id
    where i.status = 'unpaid' and i.due_date <= today + 3
  loop
    perform public.notify(r.profile_id,'commission_invoice_due',
      case when r.due_date < today then 'Commission invoice overdue' else 'Commission invoice due soon' end,
      'Open your invoices to check the amount and deadline.','/owner/credits#invoices',null,'{in_app,email}',true,
      'invoice:'||r.id||':'||r.due_date||':'||case when r.due_date < today then 'overdue' else 'due-soon' end);
  end loop;
end;
$$;

revoke all on function public.record_payment_performance(), public.owner_payment_performance(uuid),
  public.send_payment_review_reminders(), public.send_refund_reminders() from public, anon, authenticated;
grant execute on function public.owner_payment_performance(uuid) to authenticated;
grant execute on function public.send_payment_review_reminders(), public.send_refund_reminders(), public.expire_unpaid_bookings() to service_role;

do $$ begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    if exists (select 1 from cron.job where jobname = 'send-refund-reminders') then
      perform cron.unschedule('send-refund-reminders');
    end if;
    perform cron.schedule('send-payment-review-reminders','*/10 * * * *','select public.send_payment_review_reminders()');
  end if;
end $$;

create function public.admin_set_payment_hardening_settings(
  p_window integer,p_review integer,p_resubmit integer,p_refund integer,p_threshold numeric,p_reason text
)
returns void language plpgsql security definer set search_path = '' as $$
declare
  reason text := public.require_dashboard_reason(p_reason);
  prior_reason text := current_setting('app.audit_reason',true);
begin
  if auth.uid() is null or not public.is_admin() then raise exception 'Not allowed.'; end if;
  if not coalesce(p_window between 1 and 168 and p_review between 2 and 72 and p_resubmit between 0 and 24
    and p_refund between 1 and 30 and p_threshold between 0 and 100000 and p_threshold = round(p_threshold,2),false)
  then raise exception 'Check the payment setting ranges.'; end if;
  perform set_config('app.audit_reason', reason, true);
  insert into public.settings (key,value,updated_by) values
    ('payment_window_hours',to_jsonb(p_window),auth.uid()), ('payment_review_hours',to_jsonb(p_review),auth.uid()),
    ('payment_resubmit_grace_hours',to_jsonb(p_resubmit),auth.uid()), ('refund_due_days',to_jsonb(p_refund),auth.uid()),
    ('credit_low_threshold',to_jsonb(p_threshold),auth.uid())
  on conflict (key) do update set value = excluded.value, updated_by = excluded.updated_by, updated_at = now()
  where public.settings.value is distinct from excluded.value;
  perform set_config('app.audit_reason',coalesce(prior_reason,''),true);
end;
$$;
revoke all on function public.admin_set_payment_hardening_settings(integer,integer,integer,integer,numeric,text) from public, anon, authenticated;
grant execute on function public.admin_set_payment_hardening_settings(integer,integer,integer,integer,numeric,text) to authenticated;

alter table public.settings add constraint qr_payment_settings_range check (
  case when key in ('payment_window_hours','payment_review_hours','payment_resubmit_grace_hours','refund_due_days','credit_low_threshold') then
    case when jsonb_typeof(value) = 'number' then
      case key
        when 'payment_window_hours' then (value #>> '{}')::numeric between 1 and 168
        when 'payment_review_hours' then (value #>> '{}')::numeric between 2 and 72
        when 'payment_resubmit_grace_hours' then (value #>> '{}')::numeric between 0 and 24
        when 'refund_due_days' then (value #>> '{}')::numeric between 1 and 30
        when 'credit_low_threshold' then (value #>> '{}')::numeric between 0 and 100000
      end and (value #>> '{}')::numeric = round((value #>> '{}')::numeric,case when key = 'credit_low_threshold' then 2 else 0 end)
    else false end
  else true end
) not valid;

create or replace function public.prepare_admin_digest()
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  config public.admin_alert_config;
  manila_day date := (now() at time zone 'Asia/Manila')::date;
  midnight timestamptz := manila_day::timestamp at time zone 'Asia/Manila';
  yesterday timestamptz := (manila_day-1)::timestamp at time zone 'Asia/Manila';
  batch_id uuid;
  waiting jsonb;
  events jsonb;
  heads jsonb;
  activity jsonb;
  attention bigint;
begin
  select * into config from public.admin_alert_config where id for update;
  if config.last_digest_on >= manila_day then return null; end if;

  begin
    perform public.admin_alert('plan.expiring','Owner plans expiring','A paid owner plan expires within seven days.',
      '/admin/owners','plan.expiring:' || op.owner_id || ':' || extract(epoch from op.expires_at))
    from public.owner_plans op join public.plans p on p.id=op.plan_id
    where op.status='active' and p.code<>'starter' and op.expires_at between now() and now()+interval '7 days';
  exception when others then
    raise warning 'Could not enqueue plan expiry alerts (%).', sqlstate;
  end;

  if config.digest_enabled is not true then return null; end if;
  select id into batch_id from public.admin_alert_queue where dedupe_key='daily:' || manila_day;
  if found then return batch_id; end if;

  -- Release an undelivered prior day's events into today's digest.
  update public.admin_alert_queue entry set digest_batch=null
  from public.admin_alert_queue previous
  where entry.digest_batch=previous.id and entry.status='digest'
    and previous.kind='daily' and previous.digest_on < manila_day
    and coalesce(previous.lease_until,'-infinity') <= now() and previous.status <> 'sent';

  select coalesce(jsonb_agg(jsonb_build_object('label',label,'path',path,'count',total,'oldest',oldest) order by position),'[]'), coalesce(sum(total),0)
    into waiting,attention
  from (
    select 1 as position,'Owner applications' as label,'/admin/owner-applications' as path,count(*) as total,min(created_at) as oldest from public.owner_applications where status='pending'
    union all select 2,'Owner payment QRs','/admin/owners',count(*),min(coalesce(qr.created_at,o.created_at))
      from public.owners o left join lateral (
        select created_at from public.audit_log where entity_type='owner' and entity_id=o.id::text and changes ? 'payment_qr_path' order by id desc limit 1
      ) qr on true where o.payment_qr_path is not null and not o.payment_qr_verified and o.archived_at is null
    union all select 3,'Owner top-ups','/admin/topups',count(*),min(created_at) from public.owner_credit_ledger where type='topup' and status='pending'
    union all select 4,'Customer documents','/admin/customers',count(*),min(coalesce(docs.created_at,p.created_at))
      from public.profiles p left join lateral (
        select created_at from public.audit_log where entity_type='customer' and entity_id=p.id::text and changes ?| array['license_path','id_path'] order by id desc limit 1
      ) docs on true where p.role='customer' and p.verification='pending' and p.customer_archived_at is null
    union all select 5,'Booking payments','/admin/payments',count(*),min(paid_at) from public.payments where status='pending'
    union all select 6,'Plan payments','/admin/plan-payments',count(*),min(created_at) from public.plan_payments where status='pending'
    union all select 7,'Contact messages','/admin/contact-messages',count(*),min(created_at) from public.contact_messages where status='new'
    union all select 8,'Review reports','/admin/reviews',count(*),min(created_at) from public.review_reports where status='open'
    union all select 9,'Overdue refunds','/admin/payments',count(*),min(due_at) from public.booking_refunds
      where status='owed' and due_at <= now()
    union all select 10,'Open payment disputes','/admin/payments',count(*),min(created_at) from public.payment_disputes where status='open'
  ) items where total>0;

  select coalesce(jsonb_agg(jsonb_build_object('label',label,'count',total) order by label),'[]') into heads from (
    select 'Paid plans expiring within seven days' as label,count(*) as total from public.owner_plans op join public.plans p on p.id=op.plan_id
      where op.status='active' and p.code<>'starter' and op.expires_at between now() and now()+interval '7 days'
    union all select 'Owners with low credits',count(*) from public.owners o
      cross join lateral public.calculate_owner_credit_state(o.id) b
      where o.is_active and o.fee_mode='credits' and (b.available <= 0 or b.available < b.low_threshold)
    union all select 'Per-user notifications with delivery problems',count(*) from public.notifications where admin_alert_failure_at>now()-interval '1 day'
    union all select 'Admin email alerts that failed',count(*) from public.admin_alert_queue where status='failed' and failed_at>now()-interval '1 day'
  ) totals where total>0;

  select jsonb_build_object(
    'newBookings',count(*),
    'bookedValue',coalesce(sum(total_price) filter(where status in ('confirmed','picked_up','returned','completed')),0),
    'commission',coalesce(sum(commission_amount) filter(where status in ('confirmed','picked_up','returned','completed')),0),
    'confirmed',(select count(distinct entity_id) from public.audit_log where created_at>=yesterday and created_at<midnight
      and entity_type='booking' and changes->'status'->>'to'='confirmed'),
    'cancelled',(select count(distinct entity_id) from public.audit_log where created_at>=yesterday and created_at<midnight
      and entity_type='booking' and changes->'status'->>'to' in ('cancelled','expired')))
    into activity from public.bookings where created_at>=yesterday and created_at<midnight;

  batch_id := gen_random_uuid();
  update public.admin_alert_queue set digest_batch=batch_id where status='digest' and digest_batch is null;
  select coalesce(jsonb_agg(jsonb_build_object('label',label,'count',total) order by label),'[]') into events
    from (select r.label,count(*) as total from public.admin_alert_queue q join public.admin_alert_rules r using(event_key)
      where q.digest_batch=batch_id group by r.label) grouped;

  if attention=0 and events='[]' and heads='[]' and not config.digest_even_if_empty then return null; end if;
  if attention=0 then
    select coalesce(sum((item->>'count')::bigint),0) into attention from jsonb_array_elements(heads || events) as items(item);
  end if;
  insert into public.admin_alert_queue(id,event_key,title,url,kind,dedupe_key,digest_on,digest_data)
    values (batch_id,'daily.summary',case when attention=0 then 'Daily summary: all caught up'
      else 'Daily summary: ' || attention || ' things need attention' end,'/admin','daily','daily:' || manila_day,manila_day,
      jsonb_build_object('waiting',waiting,'activity',activity,'events',events,'heads',heads));
  return batch_id;
end;
$$;

-- Customers can read their case and its decision; internal owner replies stay
-- available to the owner and the admin through the underlying table.
drop policy "Read related disputes" on public.payment_disputes;
create policy "Read owner and admin disputes" on public.payment_disputes for select to authenticated
using ((select public.is_admin()) or exists (
  select 1 from public.bookings b join public.owners o on o.id = b.owner_id
  where b.id = payment_disputes.booking_id and o.profile_id = (select auth.uid())));
create view public.customer_payment_disputes with (security_barrier = true) as
select id,booking_id,kind,message,status,resolution,created_at
from public.payment_disputes where opened_by = (select auth.uid());
revoke all on public.customer_payment_disputes from public, anon, authenticated;
grant select on public.customer_payment_disputes to authenticated;

create function public.customer_booking_pickup(p_booking_id uuid)
returns table (pickup_location text,pickup_time time,contact_phone text)
language sql stable security definer set search_path = '' as $$
  select coalesce(pickup.address,b.pickup_location),b.pickup_time,o.contact_phone
  from public.bookings b join public.owners o on o.id = b.owner_id
  left join public.pickup_locations pickup on pickup.id = b.pickup_location_id and pickup.owner_id = b.owner_id
  where b.id = p_booking_id and b.customer_id = auth.uid()
    and b.status in ('confirmed','picked_up','returned','completed')
    and b.amount_paid_online > 0
$$;
revoke all on function public.customer_booking_pickup(uuid) from public, anon, authenticated;
grant execute on function public.customer_booking_pickup(uuid) to authenticated;

-- Keep pickup search working without making owner-provided addresses public.
drop policy "Anyone can read active pickup locations" on public.pickup_locations;
create policy "Admins read pickup locations" on public.pickup_locations for select to authenticated
using ((select public.is_admin()));
revoke select on public.pickup_locations from anon;
create view public.public_pickup_search with (security_barrier = true) as
select p.owner_id,p.name from public.pickup_locations p join public.owners o on o.id = p.owner_id
where p.is_active and o.is_active;
revoke all on public.public_pickup_search from public, anon, authenticated;
grant select on public.public_pickup_search to anon, authenticated;

create function public.guard_payment_settings_reason()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  setting_key text := case when tg_op = 'DELETE' then old.key else new.key end;
begin
  if tg_op = 'UPDATE' and new.key = old.key and new.value is not distinct from old.value then return new; end if;
  if setting_key in ('payment_window_hours','payment_review_hours','payment_resubmit_grace_hours','refund_due_days','credit_low_threshold')
    or (tg_op = 'UPDATE' and old.key in ('payment_window_hours','payment_review_hours','payment_resubmit_grace_hours','refund_due_days','credit_low_threshold')) then
    if auth.uid() is not null and (tg_op = 'DELETE' or nullif(current_setting('app.audit_reason',true),'') is null) then
      raise exception 'Change payment deadlines through the audited settings form.';
    end if;
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;
revoke all on function public.guard_payment_settings_reason() from public, anon, authenticated;
create trigger guard_payment_settings_reason before insert or update or delete on public.settings
for each row execute function public.guard_payment_settings_reason();

create or replace function public.notify_booking_events()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
 v_owner_user uuid;
 v_policy text;
 v_amounts text;
 v_refund_amount numeric;
 v_refund_copy constant text := 'The refund is sent by the vehicle owner. Kuyog Bohol helps record and track it.';
begin
 select profile_id into v_owner_user from public.owners where id=new.owner_id;
 if new.cancel_free_until is not null then
  v_policy := format(' Free cancellation until %s Manila time. The owner keeps %s%% of verified reservation payments after that cutoff.',
    to_char(new.cancel_free_until at time zone 'Asia/Manila', 'YYYY-MM-DD HH24:MI'), new.cancel_fee_percent);
 end if;
 if tg_op='INSERT' then
  perform public.notify(v_owner_user,'new_booking','New booking request','A customer booked one of your cars.','/owner/bookings',new.id,'{in_app,email,push}',false,'new-booking:'||new.id);
  perform public.notify(new.customer_id,'booking_created','Booking created','Your booking request was received.' || coalesce(v_policy, ''),'/account/bookings',new.id,'{in_app,email}',false,'booking-created:'||new.id);
  return new;
 end if;
 if new.deposit_refund_status = 'refunded' and old.deposit_refund_status = 'owed' then
  select amount into v_refund_amount from public.booking_refunds where booking_id = new.id;
  perform public.notify(new.customer_id,'refund_sent','Refund sent',
    (case when v_refund_amount > 0 then format('Refund sent: ₱%s. ', v_refund_amount) else 'Your refund was recorded. ' end) || v_refund_copy,
    '/account/bookings/'||new.id||'/pay',new.id,'{in_app,email}',true,'refund-sent:'||new.id||':'||new.refunded_at::text);
 end if;
 if new.status is not distinct from old.status then return new; end if;
 if new.status='payment_review' then
  perform public.notify(v_owner_user,'payment_proof_uploaded','Payment proof to verify',format('Check your wallet or bank app for the %s reservation payment. Review by %s Manila time.',
    to_char(new.amount_due_now,'FM"₱"999,999,990.00'), to_char(new.review_due_at at time zone 'Asia/Manila','YYYY-MM-DD HH24:MI')),'/owner/payments',new.id,'{in_app,email,push}',true,'proof:'||new.id||':'||new.review_due_at::text);
 elsif new.status='confirmed' then
  perform public.notify(new.customer_id,'payment_verified','Booking confirmed','Your reservation payment was verified.' || coalesce(v_policy, ''),'/account/bookings',new.id,'{in_app,email,push}',true,'verified:'||new.id);
 elsif new.status='awaiting_payment' and old.status='payment_review' then
  perform public.notify(new.customer_id,'payment_rejected','Payment proof needs another upload',case when greatest(new.payment_due_at,new.payment_resubmit_due_at) > now() and
       (select count(*) from public.payments where booking_id = new.id) < 3
      then 'The proof needs review. Open payment details for the reason and resubmission deadline.'
      else 'Open payment details for the reason and contact support if you already paid.' end,
    '/account/bookings/'||new.id||'/pay',new.id,'{in_app,email,push}',true,'rejected-proof:'||new.id||':'||clock_timestamp()::text);
 elsif new.status='expired' then
  if auth.uid() is distinct from new.customer_id then perform public.notify(new.customer_id,'booking_expired','Booking expired',case when old.status = 'payment_review' then 'The review window passed. Open payment details to follow the refund.'
      else 'The payment deadline passed and the booking was released.' end,'/account/bookings',new.id,'{in_app,email}',false,'expired:'||new.id); end if;
 elsif new.status='cancelled' then
  v_amounts := case when new.deposit_refund_status = 'owed' and new.refund_amount = 0
    then 'The transfer is awaiting reconciliation. Open payment details for the refund status.'
    else format('Fee kept: ₱%s. Refund: ₱%s.', new.cancel_fee_amount, new.refund_amount) end;
  perform public.notify(new.customer_id,'booking_cancelled_confirmation','Booking cancelled',
    v_amounts || case when new.refund_amount > 0 then ' ' || v_refund_copy ||
      format(' Contact support if you have not received it within %s days.',
        coalesce((select value #>> '{}' from public.settings where key = 'refund_support_days'), '3'))
      else '' end,
    '/account/bookings/'||new.id||'/pay',new.id,'{in_app,email,push}',true,'customer-cancelled:'||new.id);
  perform public.notify(v_owner_user,'booking_cancelled','Booking cancelled',
    format('Cancelled by %s (%s). %s', coalesce(new.cancelled_by_role, 'system'), coalesce(replace(new.cancel_kind,'_',' '), 'cancelled'), v_amounts)
      || case when new.refund_amount > 0 then ' ' || v_refund_copy else '' end,
    case when new.deposit_refund_status = 'owed' then '/owner/payments?tab=refunds' else '/owner/bookings' end,
    new.id,'{in_app,email,push}',true,'owner-cancelled:'||new.id);
 elsif new.status='rejected' then
  if auth.uid() is distinct from new.customer_id then perform public.notify(new.customer_id,'booking_cancelled','Booking declined','The owner could not accept this booking.','/account/bookings',new.id,'{in_app,email,push}',true,'booking-rejected:'||new.id); end if;
 end if;
 return new;
end $$;

revoke all on function public.notify_booking_events() from public, anon, authenticated;
