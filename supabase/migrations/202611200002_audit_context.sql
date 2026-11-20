-- Set audit context during the call and restore it before returning. If an error escapes, PostgreSQL rolls back the transaction-local change.

create or replace function public.reject_booking_payment(p_payment_id uuid, p_reason text)
returns void language plpgsql security definer set search_path = ''
as $$
declare
  previous_audit_context text := current_setting('app.audit_reason', true);
  payment_row public.payments%rowtype;
  booking_row public.bookings%rowtype;
  owner_row public.owners%rowtype;
begin
  perform set_config('app.audit_reason', coalesce(p_reason, ''), true);
  select * into payment_row from public.payments where id = p_payment_id for update;
  if not found or payment_row.status <> 'pending' then raise exception 'Payment not found or already processed.'; end if;
  select * into booking_row from public.bookings where id = payment_row.booking_id for update;
  select * into owner_row from public.owners where id = booking_row.owner_id;
  if not (owner_row.profile_id = auth.uid() or public.is_admin()) then raise exception 'Not allowed.'; end if;
  if booking_row.status <> 'payment_review' then raise exception 'Booking is not waiting for payment review.'; end if;
  p_reason := public.require_dashboard_reason(p_reason);
  update public.payments set status = 'rejected', rejection_reason = p_reason where id = p_payment_id;
  update public.bookings set status = case when payment_due_at <= now() then 'expired'::public.booking_status else 'awaiting_payment'::public.booking_status end,
    deposit_refund_status = case when payment_due_at <= now() then 'owed' else deposit_refund_status end
  where id = booking_row.id;
  perform set_config('app.audit_reason', coalesce(previous_audit_context, ''), true);
end;
$$;

create or replace function public.cancel_booking(p_booking_id uuid, p_reason text)
returns void language plpgsql security definer set search_path = ''
as $$
declare
  previous_audit_context text := current_setting('app.audit_reason', true);
  booking_row public.bookings%rowtype;
  owner_row public.owners%rowtype;
begin
  perform set_config('app.audit_reason', coalesce(p_reason, ''), true);
  select * into booking_row from public.bookings where id = p_booking_id for update;
  if not found then raise exception 'Booking not found.'; end if;
  select * into owner_row from public.owners where id = booking_row.owner_id;
  if not (booking_row.customer_id = auth.uid() or owner_row.profile_id = auth.uid() or public.is_admin()) then
    raise exception 'Not allowed.';
  end if;
  if booking_row.status not in ('awaiting_payment', 'payment_review', 'confirmed') then
    raise exception 'This booking can no longer be cancelled.';
  end if;
  if booking_row.customer_id = auth.uid() and booking_row.start_date <= (now() at time zone 'Asia/Manila')::date then
    raise exception 'Customers can only cancel before the rental starts.';
  end if;

  p_reason := public.require_dashboard_reason(p_reason);

  if booking_row.platform_fee_charged then
    insert into public.owner_credit_ledger (owner_id, type, amount, booking_id, status, note, created_by)
    values (owner_row.id, 'fee_refund', booking_row.commission_amount, booking_row.id,
            'posted', 'Fee refunded because booking was cancelled.', auth.uid());
  end if;
  update public.payments set status = 'rejected', rejection_reason = 'Booking cancelled; refund any received transfer to the customer.'
    where booking_id = booking_row.id and status = 'pending';
  update public.bookings set status = 'cancelled', cancel_reason = p_reason,
    platform_fee_charged = false,
    deposit_refund_status = case when amount_paid_online > 0 or exists (
      select 1 from public.payments p where p.booking_id = booking_row.id and p.status = 'verified'
    ) or exists (
      select 1 from public.payments p where p.booking_id = booking_row.id and p.status = 'rejected'
        and p.rejection_reason = 'Booking cancelled; refund any received transfer to the customer.'
    ) then 'owed' else 'none' end
  where id = booking_row.id;
  perform set_config('app.audit_reason', coalesce(previous_audit_context, ''), true);
end;
$$;

create or replace function public.admin_review_owner_topup(p_ledger_id uuid, p_approve boolean, p_reason text default null)
returns void language plpgsql security definer set search_path = ''
as $$
declare
  previous_audit_context text := current_setting('app.audit_reason', true);
  ledger_row public.owner_credit_ledger%rowtype;
begin
  perform set_config('app.audit_reason', coalesce(case when not p_approve then p_reason end, ''), true);
  if not public.is_admin() then raise exception 'Administrator access required.'; end if;
  select * into ledger_row from public.owner_credit_ledger where id = p_ledger_id for update;
  if not found or ledger_row.type <> 'topup' or ledger_row.status <> 'pending' then raise exception 'Pending top-up not found.'; end if;
  if p_approve is not true then p_reason := public.require_dashboard_reason(p_reason); end if;
  update public.owner_credit_ledger set status = case when p_approve then 'posted' else 'rejected' end,
    note = case when p_approve then 'Top-up verified.' else p_reason end,
    reviewed_by = auth.uid(), reviewed_at = now()
  where id = p_ledger_id;
  perform set_config('app.audit_reason', coalesce(previous_audit_context, ''), true);
end;
$$;

create or replace function public.admin_review_plan_payment(p_payment uuid,p_approve boolean,p_reason text default null)
returns void language plpgsql security definer set search_path=public
as $$
declare
  previous_audit_context text := current_setting('app.audit_reason', true);
  v_payment public.plan_payments%rowtype; v_profile uuid; v_code text;
begin
  perform set_config('app.audit_reason', coalesce(case when not p_approve then p_reason end, ''), true);
 if not public.is_admin() then raise exception 'Administrator access required.'; end if;
 select * into v_payment from public.plan_payments where id=p_payment for update;
 if not found or v_payment.status<>'pending' then raise exception 'Pending payment not found.'; end if;
 if p_approve then
  select code into v_code from public.plans where id=v_payment.plan_id;
  perform public.admin_activate_owner_plan(v_payment.owner_id,v_code,v_payment.months,v_payment.id);
 else
  p_reason := public.require_dashboard_reason(p_reason);
  update public.plan_payments set status='rejected',reject_reason=p_reason,reviewed_by=auth.uid(),reviewed_at=now() where id=p_payment;
  select profile_id into v_profile from public.owners where id=v_payment.owner_id;
  perform public.notify(v_profile,'plan_payment_rejected','Plan payment needs attention',p_reason,'/owner/plan',null,'{in_app,email}',false,'plan-payment-rejected:'||p_payment);
 end if;
  perform set_config('app.audit_reason', coalesce(previous_audit_context, ''), true);
end $$;

create or replace function public.decline_pending_booking(p_booking_id uuid, p_reason text)
returns void language plpgsql security definer set search_path = ''
as $$
declare
  previous_audit_context text := current_setting('app.audit_reason', true);
begin
  perform set_config('app.audit_reason', coalesce(p_reason, ''), true);
  p_reason := public.require_dashboard_reason(p_reason);
  update public.bookings b
  set status = 'rejected', cancel_reason = p_reason
  from public.owners o
  where b.id = p_booking_id and b.owner_id = o.id and o.is_active
    and (o.profile_id = auth.uid() or public.is_admin()) and b.status = 'pending';
  if not found then raise exception 'This booking is no longer pending or is unavailable.'; end if;
  perform set_config('app.audit_reason', coalesce(previous_audit_context, ''), true);
end;
$$;

create or replace function public.admin_reject_customer_verification(p_customer_id uuid, p_reason text)
returns void language plpgsql security definer set search_path = ''
as $$
declare
  previous_audit_context text := current_setting('app.audit_reason', true);
begin
  perform set_config('app.audit_reason', coalesce(p_reason, ''), true);
  if not public.is_admin() then raise exception 'Administrator access required.'; end if;
  p_reason := public.require_dashboard_reason(p_reason);
  update public.profiles
  set verification = 'rejected', verification_rejection_reason = p_reason
  where id = p_customer_id and role = 'customer';
  if not found then raise exception 'Customer profile not found.'; end if;
  perform set_config('app.audit_reason', coalesce(previous_audit_context, ''), true);
end;
$$;

create or replace function public.admin_set_owner_plan_override(p_owner uuid,p_car_limit int,p_commission numeric,p_note text)
returns void language plpgsql security definer set search_path=public
as $$
declare
  previous_audit_context text := current_setting('app.audit_reason', true);
  v_code text;
begin
  perform set_config('app.audit_reason', coalesce(p_note, ''), true);
 if not public.is_admin() then raise exception 'Administrator access required.'; end if;
 if p_car_limit is not null and p_car_limit not between 1 and 1000 then raise exception 'Invalid car limit.'; end if;
 if p_commission is not null and p_commission not between 0 and .5 then raise exception 'Invalid commission.'; end if;
 if nullif(btrim(p_note),'') is null then raise exception 'A note is required.'; end if;
 update public.owner_plans set car_limit_override=p_car_limit,commission_override=p_commission,updated_by=auth.uid(),updated_at=now() where owner_id=p_owner;
 if not found then raise exception 'Owner plan not found.'; end if;
 select code into v_code from public.plans p join public.owner_plans op on op.plan_id=p.id where op.owner_id=p_owner;
 perform public.sync_owner_plan(p_owner);
 insert into public.owner_plan_events(owner_id,event,to_plan,detail,actor) values(p_owner,'override_set',v_code,jsonb_build_object('car_limit',p_car_limit,'commission',p_commission,'note',p_note),auth.uid());
  perform set_config('app.audit_reason', coalesce(previous_audit_context, ''), true);
end $$;

create or replace function public.expire_unpaid_bookings()
returns integer language plpgsql security definer set search_path = ''
as $$
declare
  previous_audit_context text := current_setting('app.audit_actor', true);
  affected integer;
begin
  perform set_config('app.audit_actor', coalesce('cron:expire_unpaid_bookings', ''), true);
  update public.payments set status = 'rejected',
    rejection_reason = 'Payment window expired; reconcile any received transfer and refund it to the customer.'
  where status = 'pending' and booking_id in (
    select id from public.bookings where status = 'payment_review' and payment_due_at <= now()
  );
  update public.bookings set status = 'expired',
    deposit_refund_status = case when status = 'payment_review' then 'owed' else deposit_refund_status end
  where status in ('awaiting_payment', 'payment_review') and payment_due_at <= now();
  get diagnostics affected = row_count;
  perform set_config('app.audit_actor', coalesce(previous_audit_context, ''), true);
  return affected;
end;
$$;

create or replace function public.expire_owner_plans() returns void language plpgsql security definer set search_path=public
as $$
declare
  previous_audit_context text := current_setting('app.audit_actor', true);
  r record; v_grace int; v_limit int; v_active int; v_hidden int;
begin
  perform set_config('app.audit_actor', coalesce('cron:expire_owner_plans', ''), true);
 select coalesce((value#>>'{}')::int,3) into v_grace from public.settings where key='plan_grace_days'; v_grace:=coalesce(v_grace,3);
 for r in select op.owner_id,p.code from public.owner_plans op join public.plans p on p.id=op.plan_id where op.status='active' and op.expires_at is not null and op.expires_at+make_interval(days=>v_grace)<=now() and p.code<>'starter' loop
  select max_active_cars into v_limit from public.plans where code='starter';
  select count(*) into v_active from public.cars where owner_id=r.owner_id and is_active;
  v_hidden:=greatest(0,v_active-v_limit);
  if v_hidden>0 then
   with excess as (select id from public.cars where owner_id=r.owner_id and is_active order by created_at desc limit v_hidden)
   update public.cars c set is_active=false,plan_hidden=true from excess e where c.id=e.id;
  end if;
  update public.owner_plans set status='expired',car_limit_override=null,commission_override=null,updated_at=now() where owner_id=r.owner_id;
  perform public.sync_owner_plan(r.owner_id);
  insert into public.owner_plan_events(owner_id,event,from_plan,to_plan,detail) values(r.owner_id,'expired',r.code,'starter',jsonb_build_object('cars_hidden',v_hidden));
 end loop;
  perform set_config('app.audit_actor', coalesce(previous_audit_context, ''), true);
end $$;
