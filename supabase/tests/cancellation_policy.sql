begin;

insert into auth.users(id,email,raw_user_meta_data) values
 ('a1000000-0000-4000-8000-000000000001','cancellation-customer@example.invalid','{}'),
 ('a1000000-0000-4000-8000-000000000002','cancellation-owner@example.invalid','{}'),
 ('a1000000-0000-4000-8000-000000000003','cancellation-admin@example.invalid','{}'),
 ('a1000000-0000-4000-8000-000000000004','cancellation-other@example.invalid','{}');
update public.profiles set role='owner' where id='a1000000-0000-4000-8000-000000000002';
update public.profiles set role='admin' where id='a1000000-0000-4000-8000-000000000003';
update public.profiles set license_classes=array['car'],verification='approved' where id='a1000000-0000-4000-8000-000000000001';
insert into public.owners(id,profile_id,business_name,payment_qr_verified,fee_mode,commission_rate)
 values('a2000000-0000-4000-8000-000000000001','a1000000-0000-4000-8000-000000000002','Cancellation fixture',true,'invoice',0.05);

create function pg_temp.cancellation_claim(actor int) returns void language plpgsql as $$
declare who text := 'a1000000-0000-4000-8000-' || lpad(actor::text,12,'0');
begin
  perform set_config('request.jwt.claim.sub',coalesce(who,''),true);
  perform set_config('request.jwt.claims',case when actor is null then '{}' else jsonb_build_object('sub',who,'role','authenticated')::text end,true);
end $$;
create function pg_temp.booking_id(number int) returns uuid language sql immutable as $$
  select ('a4000000-0000-4000-8000-' || lpad(number::text,12,'0'))::uuid
$$;
create function pg_temp.expect_cancellation_error(statement text, expected text) returns void language plpgsql as $$
begin
  execute statement;
  raise exception 'Expected error: %', expected;
exception when raise_exception then
  assert sqlerrm = expected, sqlerrm;
end $$;
create function pg_temp.assert_cancellation(number int, mode text, kind text, fee numeric, refund numeric)
returns void language plpgsql as $$
declare
  id uuid := pg_temp.booking_id(number);
  preview jsonb := public.cancellation_preview(id,mode);
  result jsonb;
begin
  assert (preview->>'can_cancel')::boolean;
  assert preview->>'kind' = kind, preview::text;
  assert (preview->>'fee')::numeric = fee, preview::text;
  assert (preview->>'refund')::numeric = refund, preview::text;
  assert (preview->>'commission')::numeric = fee * 0.05, preview::text;
  result := public.cancel_booking(id,'Fixture cancellation reason',mode);
  assert result = preview;
end $$;

select pg_temp.cancellation_claim(2);
insert into public.cars(id,owner_id,brand,model) values
 ('a3000000-0000-4000-8000-000000000001','a2000000-0000-4000-8000-000000000001','Cancellation','Fixture');
select pg_temp.cancellation_claim(null);
insert into public.car_rates(car_id,mode,daily_rate,deposit_amount)
 values('a3000000-0000-4000-8000-000000000001','self_drive',4000,500);
insert into public.bookings(id,car_id,customer_id,mode,start_date,end_date)
select pg_temp.booking_id(i),'a3000000-0000-4000-8000-000000000001','a1000000-0000-4000-8000-000000000001',
 'self_drive',(now() at time zone 'Asia/Manila')::date + i * 3,(now() at time zone 'Asia/Manila')::date + i * 3 + 1
from generate_series(1,12) i;
update public.bookings set status='confirmed', payment='partial',amount_paid_online=1200,platform_fee_charged=id in (pg_temp.booking_id(1),pg_temp.booking_id(2))
 where id in (select pg_temp.booking_id(i) from generate_series(1,9) i);
update public.bookings set cancel_free_until=now() where id=pg_temp.booking_id(1);
update public.bookings set cancel_free_until=now()-interval '1 second' where id=pg_temp.booking_id(2);
update public.bookings set start_date=(now() at time zone 'Asia/Manila')::date, end_date=(now() at time zone 'Asia/Manila')::date,
 rental_starts_at=now()-interval '1 hour',cancel_free_until=now()-interval '25 hours'
 where id=pg_temp.booking_id(4);
update public.bookings set rental_starts_at=now()-interval '1 second' where id=pg_temp.booking_id(8);
update public.bookings set status='picked_up' where id=pg_temp.booking_id(9);

set local role authenticated;
select pg_temp.cancellation_claim(3);
do $$ begin
  if to_regprocedure('public.reconcile_cancelled_booking_invoice()') is not null then
    perform public.admin_generate_monthly_invoices((now() at time zone 'Asia/Manila')::date);
  end if;
end $$;
select pg_temp.expect_cancellation_error(
 $$select public.cancel_booking(pg_temp.booking_id(5),'no','full_refund')$$,'Please give a reason (3 to 300 characters).');
select pg_temp.assert_cancellation(5,'full_refund','admin_full',0,1200);
select pg_temp.assert_cancellation(6,'apply_policy','admin_policy',600,600);
select public.admin_set_cancellation_override('a2000000-0000-4000-8000-000000000001',48,25);
select pg_temp.expect_cancellation_error(
 $$select public.admin_set_cancellation_override('a2000000-0000-4000-8000-000000000001',48,101)$$,
 'Enter a cancellation fee from 0 to 100 percent.');
update public.settings set value='12' where key='cancellation_free_hours';
update public.settings set value='18' where key='pickup_reference_hour';

select pg_temp.cancellation_claim(4);
select pg_temp.expect_cancellation_error(
 $$select public.cancellation_preview(pg_temp.booking_id(1))$$,'Not allowed.');
select pg_temp.expect_cancellation_error(
 $$select public.cancel_booking(pg_temp.booking_id(1),'Fixture')$$,'Not allowed.');

select pg_temp.cancellation_claim(1);
select pg_temp.expect_cancellation_error(
 $$select public.cancel_booking(pg_temp.booking_id(1),'Fixture','full_refund')$$,'Invalid cancellation mode.');
select pg_temp.expect_cancellation_error(
 $$select public.cancel_booking(pg_temp.booking_id(1),'Fixture','no_show')$$,'Invalid cancellation mode.');
select pg_temp.expect_cancellation_error(
 $$select public.cancel_booking(pg_temp.booking_id(8),'Fixture')$$,'Customers can only cancel before the rental starts.');
select pg_temp.expect_cancellation_error(
 $$select public.cancel_booking(pg_temp.booking_id(9),'Fixture')$$,'This booking can no longer be cancelled.');
select pg_temp.assert_cancellation(1,'auto','free',0,1200);
select pg_temp.assert_cancellation(2,'auto','late',600,600);
select pg_temp.assert_cancellation(10,'auto','free',0,0);
insert into storage.objects(bucket_id,name)
 select 'payment-proofs',customer_id || '/' || id || '/proof.webp' from public.bookings where id=pg_temp.booking_id(12);
select public.submit_booking_payment(id,'CANCELLATION-REJECT',customer_id || '/' || id || '/proof.webp')
 from public.bookings where id=pg_temp.booking_id(12);

select pg_temp.cancellation_claim(2);
select pg_temp.expect_cancellation_error(
 $$select public.cancel_booking(pg_temp.booking_id(3),'Fixture','no_show')$$,'A no-show can only be recorded on or after the rental start date.');
select pg_temp.assert_cancellation(3,'auto','owner',0,1200);
select pg_temp.assert_cancellation(4,'no_show','no_show',600,600);
select public.reject_booking_payment(id,'Could not verify payment') from public.payments where reference_no='CANCELLATION-REJECT';
insert into storage.objects(bucket_id,name)
select 'refund-proofs',auth.uid() || '/' || pg_temp.booking_id(n) || '/refund.webp' from generate_series(1,2) n;
select public.mark_booking_refunded(pg_temp.booking_id(1),'First refund',auth.uid() || '/' || pg_temp.booking_id(1) || '/refund.webp');
select public.mark_booking_refunded(pg_temp.booking_id(2),'  Refund fixture  ',auth.uid() || '/' || pg_temp.booking_id(2) || '/refund.webp');
select pg_temp.expect_cancellation_error(
 $$select public.mark_booking_refunded(pg_temp.booking_id(2),'Already sent',null)$$,'Refund is not pending.');
select pg_temp.expect_cancellation_error(
 $$select public.mark_booking_refunded(pg_temp.booking_id(4),repeat('x',81),null)$$,'Enter a refund reference.');
do $$ begin
  assert not has_column_privilege('authenticated','public.owners','cancellation_free_hours','UPDATE');
  assert not has_column_privilege('authenticated','public.bookings','refund_amount','UPDATE');
end $$;

reset role;
select pg_temp.cancellation_claim(null);
insert into public.bookings(id,car_id,customer_id,mode,start_date,end_date)
 values(pg_temp.booking_id(13),'a3000000-0000-4000-8000-000000000001','a1000000-0000-4000-8000-000000000001',
 'self_drive',current_date+42,current_date+43);
do $$ begin
  if to_regprocedure('public.send_refund_reminders()') is not null then
    update public.booking_refunds set due_at=now()+interval '12 hours' where booking_id=pg_temp.booking_id(4);
    perform public.send_refund_reminders();
    perform public.send_refund_reminders();
    update public.booking_refunds set due_at=now()-interval '72 hours' where booking_id=pg_temp.booking_id(4);
    perform public.send_refund_reminders();
    perform public.send_refund_reminders();
    assert (select count(*)=2 from public.notifications where booking_id=pg_temp.booking_id(4) and type='refund_reminder');
    assert exists(select 1 from public.notifications where booking_id=pg_temp.booking_id(2) and type='refund_sent');
  end if;
  assert (select status='awaiting_payment' and cancel_fee_amount=0 and refund_amount=0 from public.bookings where id=pg_temp.booking_id(12));
  assert (select status='rejected' from public.payments where reference_no='CANCELLATION-REJECT');
  assert (select cancel_fee_percent=50 from public.bookings where id=pg_temp.booking_id(11));
  assert (select cancel_fee_percent=25 and rental_starts_at-cancel_free_until=interval '48 hours'
    and (rental_starts_at at time zone 'Asia/Manila')::time=time '18:00' from public.bookings where id=pg_temp.booking_id(13));
  assert (select deposit_amount=500 and payment='refunded' and not platform_fee_charged and refunded_at is not null
    and commission_amount=0 from public.bookings where id=pg_temp.booking_id(1));
  assert (select payment='partial' and platform_fee_charged and refund_reference='Refund fixture'
    and refunded_at is not null and commission_amount=30 and owner_earnings=570
    from public.bookings where id=pg_temp.booking_id(2));
  assert (select amount=200 from public.owner_credit_ledger where booking_id=pg_temp.booking_id(1) and type='fee_refund');
  assert (select amount=170 from public.owner_credit_ledger where booking_id=pg_temp.booking_id(2) and type='fee_refund');
  if to_regprocedure('public.reconcile_cancelled_booking_invoice()') is not null then
    assert (select total_bookings=5 and gross_amount=13200 and commission_due=660
      from public.commission_invoices where owner_id='a2000000-0000-4000-8000-000000000001');
  end if;
  assert exists(select 1 from public.audit_log where entity_id=pg_temp.booking_id(2)::text and changes ? 'refunded_at');
  assert not has_function_privilege('anon','public.cancel_booking(uuid,text,text)','execute');
  assert not has_function_privilege('anon','public.cancellation_preview(uuid,text)','execute');
  assert not has_function_privilege('anon','public.mark_deposit_refunded(uuid,text)','execute');
end $$;

rollback;
