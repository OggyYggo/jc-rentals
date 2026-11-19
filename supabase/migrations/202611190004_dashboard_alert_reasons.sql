-- Preserve the existing action permissions and enforce dashboard reason validation in the database.
create or replace function public.require_dashboard_reason(p_reason text)
returns text language plpgsql immutable set search_path = '' as $$
declare
  reason text := regexp_replace(coalesce(p_reason, ''), '^[[:space:]]+|[[:space:]]+$', '', 'g');
begin
  if char_length(reason) not between 3 and 300 then
    raise exception 'Please give a reason (3 to 300 characters).';
  end if;
  return reason;
end;
$$;

revoke all on function public.require_dashboard_reason(text) from public, anon, authenticated;

create or replace function public.reject_booking_payment(p_payment_id uuid, p_reason text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  payment_row public.payments%rowtype;
  booking_row public.bookings%rowtype;
  owner_row public.owners%rowtype;
begin
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
end;
$$;

create or replace function public.cancel_booking(p_booking_id uuid, p_reason text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  booking_row public.bookings%rowtype;
  owner_row public.owners%rowtype;
begin
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
end;
$$;

create or replace function public.admin_review_owner_topup(p_ledger_id uuid, p_approve boolean, p_reason text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare
  ledger_row public.owner_credit_ledger%rowtype;
begin
  if not public.is_admin() then raise exception 'Administrator access required.'; end if;
  select * into ledger_row from public.owner_credit_ledger where id = p_ledger_id for update;
  if not found or ledger_row.type <> 'topup' or ledger_row.status <> 'pending' then raise exception 'Pending top-up not found.'; end if;
  if p_approve is not true then p_reason := public.require_dashboard_reason(p_reason); end if;
  update public.owner_credit_ledger set status = case when p_approve then 'posted' else 'rejected' end,
    note = case when p_approve then 'Top-up verified.' else p_reason end,
    reviewed_by = auth.uid(), reviewed_at = now()
  where id = p_ledger_id;
end;
$$;

create or replace function public.admin_review_plan_payment(p_payment uuid,p_approve boolean,p_reason text default null)
returns void language plpgsql security definer set search_path=public as $$
declare v_payment public.plan_payments%rowtype; v_profile uuid; v_code text;
begin
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
end $$;

create or replace function public.decline_pending_booking(p_booking_id uuid, p_reason text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  p_reason := public.require_dashboard_reason(p_reason);
  update public.bookings b
  set status = 'rejected', cancel_reason = p_reason
  from public.owners o
  where b.id = p_booking_id and b.owner_id = o.id and o.is_active
    and (o.profile_id = auth.uid() or public.is_admin()) and b.status = 'pending';
  if not found then raise exception 'This booking is no longer pending or is unavailable.'; end if;
end;
$$;

revoke all on function public.decline_pending_booking(uuid, text) from public, anon;
grant execute on function public.decline_pending_booking(uuid, text) to authenticated;

alter table public.profiles add column if not exists verification_rejection_reason text;
grant select (verification_rejection_reason) on public.profiles to authenticated;

create or replace function public.admin_set_customer_verification(
  customer_uuid uuid,
  next_status public.verification_status
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then raise exception 'Administrator access required.'; end if;
  if next_status = 'rejected' then
    raise exception 'Please give a reason (3 to 300 characters).';
  end if;
  if next_status not in ('pending', 'approved') then
    raise exception 'Invalid verification status.';
  end if;

  update public.profiles
  set verification = next_status, verification_rejection_reason = null
  where id = customer_uuid and role = 'customer';

  if not found then raise exception 'Customer profile not found.'; end if;
end;
$$;

create or replace function public.admin_reject_customer_verification(p_customer_id uuid, p_reason text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'Administrator access required.'; end if;
  p_reason := public.require_dashboard_reason(p_reason);
  update public.profiles
  set verification = 'rejected', verification_rejection_reason = p_reason
  where id = p_customer_id and role = 'customer';
  if not found then raise exception 'Customer profile not found.'; end if;
end;
$$;

revoke all on function public.admin_reject_customer_verification(uuid, text) from public, anon;
grant execute on function public.admin_reject_customer_verification(uuid, text) to authenticated;
