-- Older releases allowed multiple pending proofs. Keep the newest for review,
-- and retain the other rows and their files for reconciliation.
with ranked as (
  select id, row_number() over (partition by booking_id order by paid_at desc,id desc) as position
  from public.payments where status = 'pending'
)
update public.payments p set status = 'rejected', rejected_at = now(),
  rejection_reason = 'Replaced by a newer pending proof for this booking.'
from ranked r where p.id = r.id and r.position > 1;

create unique index payments_one_pending_per_booking on public.payments (booking_id) where status = 'pending';

create or replace function public.submit_booking_payment(p_booking_id uuid, p_reference text, p_proof_path text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  b public.bookings%rowtype;
  payment_id uuid;
  constraint_name text;
begin
  select * into b from public.bookings where id = p_booking_id and customer_id = auth.uid() for update;
  if not found then raise exception 'Not allowed.'; end if;

  if b.status in ('payment_review','confirmed','picked_up','returned','completed') then
    select id into payment_id from public.payments where booking_id = b.id
      and (status = 'pending' or (status = 'verified' and method = 'owner_qr'))
      order by paid_at desc,id desc limit 1;
    if found then return payment_id; end if;
  end if;

  insert into public.payments (booking_id,amount,method,reference_no,proof_path)
    values (b.id,b.amount_due_now,'owner_qr',p_reference,p_proof_path)
    returning id into payment_id;
  return payment_id;
exception when unique_violation then
  get stacked diagnostics constraint_name = CONSTRAINT_NAME;
  if constraint_name = 'payments_owner_reference_unique' then raise exception 'REFERENCE_ALREADY_USED'; end if;
  raise;
end;
$$;
revoke all on function public.submit_booking_payment(uuid,text,text) from public, anon, authenticated;
grant execute on function public.submit_booking_payment(uuid,text,text) to authenticated;
