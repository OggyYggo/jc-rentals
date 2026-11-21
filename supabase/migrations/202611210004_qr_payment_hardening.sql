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
