-- Run after all migrations in a disposable database. Every fixture rolls back.
begin;

create function pg_temp.person(n int) returns uuid language sql immutable as $$
  select ('aa100000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid
$$;
create function pg_temp.owner_id(n int) returns uuid language sql immutable as $$
  select ('aa200000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid
$$;
create function pg_temp.car_id(n int) returns uuid language sql immutable as $$
  select ('aa300000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid
$$;
create function pg_temp.booking_id(n int) returns uuid language sql immutable as $$
  select ('aa400000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid
$$;
create function pg_temp.claim(n int) returns text language sql as $$
  select set_config('request.jwt.claims',case when n is null then '{}' else
    jsonb_build_object('sub',pg_temp.person(n),'role','authenticated')::text end,true)
$$;
create function pg_temp.object_path(n int, attempt int default 1) returns text language sql immutable as $$
  select pg_temp.person(1)||'/'||pg_temp.booking_id(n)||'/proof-'||attempt||'.webp'
$$;
create function pg_temp.expect_error(statement text, expected text) returns void language plpgsql as $$
begin
  execute statement;
  raise exception 'Expected error: %', expected;
exception when others then
  assert position(expected in sqlerrm) > 0 and sqlerrm <> 'Expected error: '||expected, sqlerrm;
end
$$;
create function pg_temp.create_booking(n int, car int) returns void language sql as $$
  insert into public.bookings (id,car_id,customer_id,mode,start_date,end_date)
  values(pg_temp.booking_id(n),pg_temp.car_id(car),pg_temp.person(1),'self_drive',current_date+n*3,current_date+n*3+1)
$$;

insert into auth.users(id,email,raw_user_meta_data)
select pg_temp.person(n),'qr-test-'||n||'@example.invalid',jsonb_build_object('full_name','Payment fixture '||n)
from generate_series(1,5) n;
update public.profiles set verification='approved',license_classes=array['car'] where id=pg_temp.person(1);
update public.profiles set role='owner' where id in (pg_temp.person(2),pg_temp.person(3));
update public.profiles set role='admin' where id=pg_temp.person(4);
insert into public.owners(id,profile_id,business_name,contact_phone,payment_qr_verified,fee_mode,commission_rate)
values (pg_temp.owner_id(1),pg_temp.person(2),'QR One','09000000001',true,'invoice',0.05),
       (pg_temp.owner_id(2),pg_temp.person(3),'QR Two','09000000002',true,'invoice',0.05);
select pg_temp.claim(4);
insert into public.cars(id,owner_id,brand,model)
select pg_temp.car_id(n),pg_temp.owner_id(n),'Fixture','Car '||n from generate_series(1,2) n;
select pg_temp.claim(null);
insert into public.car_rates(car_id,mode,daily_rate,deposit_amount)
select pg_temp.car_id(n),'self_drive',12000,500 from generate_series(1,2) n;
select pg_temp.create_booking(1,1);
select pg_temp.create_booking(2,1);
select pg_temp.create_booking(3,2);
select pg_temp.create_booking(4,1);
select pg_temp.create_booking(5,1);
select pg_temp.create_booking(6,1);
select pg_temp.create_booking(9,1);

savepoint soft_launch;
do $$ begin
  assert (select total_price = 12000 and amount_due_now = 3600 and balance_at_pickup = 8400
    and commission_amount = 600 from public.bookings where id = pg_temp.booking_id(1));
  assert not public.bookings_are_paused();
end $$;
select pg_temp.expect_error($$insert into public.bookings (car_id,customer_id,mode,start_date,end_date)
  values (pg_temp.car_id(1),pg_temp.person(1),'self_drive',current_date+3,current_date+4)$$, 'no_double_booking');

set local role authenticated;
select pg_temp.claim(1);
select pg_temp.expect_error($$select public.admin_recover_booking_status(pg_temp.booking_id(1),'awaiting_payment','expired','Hold stuck')$$,'Administrator access required.');
select pg_temp.expect_error($$select public.authorize_customer_document_upload(pg_temp.person(1),'id','2026-11-25')$$,'permission denied');
select pg_temp.claim(4);
update public.settings set value = 'true' where key = 'bookings_paused';
select pg_temp.expect_error($$select public.admin_recover_booking_status(pg_temp.booking_id(1),'awaiting_payment','expired','  ')$$,'RECOVERY_REASON_REQUIRED');
select pg_temp.expect_error($$select public.admin_recover_booking_status(pg_temp.booking_id(1),'pending','expired','Hold stuck')$$,'RECOVERY_STALE_BOOKING');
select pg_temp.expect_error($$select public.admin_recover_booking_status(pg_temp.booking_id(1),'awaiting_payment','confirmed','Hold stuck')$$,'RECOVERY_TRANSITION_NOT_ALLOWED');
select public.admin_recover_booking_status(pg_temp.booking_id(1),'awaiting_payment','expired','Release stuck unpaid hold');
do $$ begin
  assert exists (select 1 from public.audit_log where entity_id = pg_temp.booking_id(1)::text
    and action = 'booking.status_changed' and reason = 'Release stuck unpaid hold'
    and actor_id = pg_temp.person(4));
end $$;
reset role;

set local role anon;
do $$ begin
  assert public.bookings_are_paused();
end $$;
reset role;

set local role service_role;
select pg_temp.expect_error($$select public.create_policy_accepted_booking(
  pg_temp.person(1),pg_temp.car_id(1),'self_drive',current_date+3,current_date+4,null,null,null,
  '2026-11-21',null,null,null)$$,'BOOKINGS_PAUSED');
do $$ begin
  for attempt in 1..10 loop
    assert public.authorize_customer_document_upload(pg_temp.person(1),'id','2026-11-25');
  end loop;
  assert not public.authorize_customer_document_upload(pg_temp.person(1),'selfie','2026-11-25');
end $$;
reset role;
do $$ begin
  assert (select count(*) = 10 and bool_and(created_at is not null and metadata->>'policy_version' = '2026-11-25')
    from public.audit_log where entity_id = pg_temp.person(1)::text and action = 'document.upload_consent');
end $$;
rollback to soft_launch;
release soft_launch;

insert into storage.objects(bucket_id,name)
select 'payment-proofs',pg_temp.object_path(n,a) from generate_series(1,9) n cross join generate_series(1,4) a;
insert into storage.objects(bucket_id,name)
values ('refund-proofs', pg_temp.person(2)||'/'||pg_temp.booking_id(1)||'/refund.webp');

set local role authenticated;
select pg_temp.claim(1);
select pg_temp.expect_error($$select public.submit_booking_payment(pg_temp.booking_id(1),'123',pg_temp.object_path(1))$$,'REFERENCE_INVALID');
select public.submit_booking_payment(pg_temp.booking_id(1),'ABC-123456',pg_temp.object_path(1));
select pg_temp.expect_error($$select public.submit_booking_payment(pg_temp.booking_id(2),'abc 123456',pg_temp.object_path(2))$$,'REFERENCE_ALREADY_USED');
select public.submit_booking_payment(pg_temp.booking_id(3),'ABC-123456',pg_temp.object_path(3));
select public.submit_booking_payment(pg_temp.booking_id(4),'GRACE-123',pg_temp.object_path(4));
select public.submit_booking_payment(pg_temp.booking_id(5),'DISPUTE-123',pg_temp.object_path(5));
select public.submit_booking_payment(pg_temp.booking_id(6),'EXPIRE-123',pg_temp.object_path(6));
select pg_temp.expect_error($$select public.open_payment_dispute(pg_temp.booking_id(5),'paid_not_confirmed','I already sent the money.')$$,'Disputes are available');
do $$ begin
  assert not exists(select 1 from public.customer_booking_pickup(pg_temp.booking_id(1)));
  assert not exists(select 1 from public.payment_receipts);
end $$;

select pg_temp.claim(5);
do $$ begin
  assert not exists(select 1 from public.payments where owner_id in (pg_temp.owner_id(1),pg_temp.owner_id(2)));
  assert not exists(select 1 from public.booking_refunds);
  assert not exists(select 1 from public.customer_payment_disputes);
end $$;
select pg_temp.expect_error($$select public.open_payment_dispute(pg_temp.booking_id(5),'paid_not_confirmed','Another booking is unavailable.')$$,'Not allowed.');

reset role;
select pg_temp.claim(null);
update public.bookings set payment_due_at=now()-interval '6 hours' where id in (pg_temp.booking_id(1),pg_temp.booking_id(4));
update public.bookings set review_due_at=now()-interval '1 minute' where id=pg_temp.booking_id(6);
update public.payments set paid_at=now()-interval '9 hours' where booking_id=pg_temp.booking_id(5);
select public.expire_unpaid_bookings();

do $$
declare
  original uuid := (select id from public.payments where booking_id=pg_temp.booking_id(1));
  duplicate uuid := (select id from public.payments where booking_id=pg_temp.booking_id(3));
begin
  assert (select status='payment_review' and review_due_at>now() from public.bookings where id=pg_temp.booking_id(1));
  assert exists(select 1 from public.public_car_booking_dates where car_id=pg_temp.car_id(1) and start_date=current_date+3);
  assert (select status='expired' and 'owner_no_response'=any(payment_flags) from public.bookings where id=pg_temp.booking_id(6));
  assert (select count(*)=1 from public.booking_refunds where booking_id=pg_temp.booking_id(6) and status='owed');
  assert exists(select 1 from public.owner_payment_events where booking_id=pg_temp.booking_id(6) and kind='no_response');
  assert public.set_payment_proof_hash(original,repeat('a',64));
  assert public.set_payment_proof_hash(duplicate,repeat('a',64));
  assert not public.set_payment_proof_hash(duplicate,repeat('a',64));
  assert (select count(*)=2 from public.payments where id in (original,duplicate) and 'duplicate_proof'=any(flags));
  assert (select count(*)=1 from public.admin_alert_queue where event_key='payment.risk' and status='digest');
end $$;

select public.send_payment_review_reminders();
select public.send_payment_review_reminders();
do $$ begin
  assert (select count(*)=2 from public.notifications where booking_id=pg_temp.booking_id(5) and type='payment_review_reminder');
  assert (select count(*)=1 from public.admin_alert_queue where event_key='payment.review_overdue');
  assert not exists(select 1 from public.notifications where body like '%ABC-123456%' or body like '%proof-%webp%');
end $$;

set local role authenticated;
select pg_temp.claim(3);
select pg_temp.expect_error(
  $$select public.confirm_booking_payment((select id from public.payments where booking_id=pg_temp.booking_id(1)),3600,'ABC-123456')$$,
  'Not allowed.');
select pg_temp.claim(2);
select pg_temp.expect_error(
  $$select public.confirm_booking_payment((select id from public.payments where booking_id=pg_temp.booking_id(1)))$$,'ATTESTATION_REQUIRED');
select pg_temp.expect_error(
  $$select public.confirm_booking_payment((select id from public.payments where booking_id=pg_temp.booking_id(1)),3599,'ABC-123456')$$,'ATTESTATION_MISMATCH');
select pg_temp.expect_error(
  $$select public.confirm_booking_payment((select id from public.payments where booking_id=pg_temp.booking_id(1)),3600,'WRONG-123')$$,'ATTESTATION_MISMATCH');
select public.reject_booking_payment((select id from public.payments where booking_id=pg_temp.booking_id(4)), 'Amount not received');
do $$ begin
  assert public.confirm_booking_payment((select id from public.payments where booking_id=pg_temp.booking_id(1)),3600,'abc 123456')='CONFIRMED';
  assert (select confirmed_amount=3600 and confirmed_reference='abc 123456' and confirmed_channel='owner'
    from public.payments where booking_id=pg_temp.booking_id(1));
  assert exists(select 1 from public.payment_receipts where booking_id=pg_temp.booking_id(1) and status='valid');
  assert exists(select 1 from public.owner_payment_performance(pg_temp.owner_id(1)) where confirmed=1 and no_response=1);
  assert not exists(select 1 from public.owner_payment_stats);
end $$;
select public.owner_mark_payment_received(pg_temp.booking_id(1),'cash');
do $$ begin
  assert (select count(*)=1 from public.payment_receipts where booking_id=pg_temp.booking_id(1));
end $$;

select pg_temp.claim(1);
select public.submit_booking_payment(pg_temp.booking_id(4),'GRACE-123',pg_temp.object_path(4,2));
select public.open_payment_dispute(pg_temp.booking_id(5),'paid_not_confirmed','I already sent the money.');
select pg_temp.expect_error($$select public.open_payment_dispute(pg_temp.booking_id(5),'paid_not_confirmed','This is the same dispute.')$$,'payment_disputes_one_open');
select pg_temp.expect_error($$select public.admin_resolve_payment_dispute((select id from public.customer_payment_disputes),true,'Customer cannot resolve this.')$$,'Not allowed.');
do $$ begin
  assert (select review_due_at>=now()+interval '24 hours' from public.bookings where id=pg_temp.booking_id(5));
  assert (select contact_phone='09000000001' from public.customer_booking_pickup(pg_temp.booking_id(1)));
  assert exists(select 1 from public.payment_receipts where booking_id=pg_temp.booking_id(1) and status='valid');
end $$;
select public.cancel_booking(pg_temp.booking_id(1),'Fixture cancellation');
do $$ begin
  assert (select status='voided' from public.payment_receipts where booking_id=pg_temp.booking_id(1));
end $$;

select pg_temp.claim(2);
select pg_temp.expect_error($$select public.mark_booking_refunded(pg_temp.booking_id(1),'',null)$$,'Enter a refund reference.');
select pg_temp.expect_error($$select public.mark_booking_refunded(pg_temp.booking_id(1),'REFUND-01',null)$$,'Upload refund proof first.');
select public.mark_booking_refunded(pg_temp.booking_id(1),'REFUND-01',pg_temp.person(2)||'/'||pg_temp.booking_id(1)||'/refund.webp');
select public.owner_reply_payment_dispute((select id from public.payment_disputes where booking_id=pg_temp.booking_id(5)),'I checked my wallet.');
select public.reject_booking_payment((select id from public.payments where booking_id=pg_temp.booking_id(4) and status='pending'), 'Still unmatched');

select pg_temp.claim(1);
select public.open_payment_dispute(pg_temp.booking_id(1),'refund_not_received','The refund has not arrived.');
do $$ begin
  assert (select status='disputed' from public.booking_refunds where booking_id=pg_temp.booking_id(1));
  assert (select status='refunded' from public.payment_receipts where booking_id=pg_temp.booking_id(1));
  assert not exists(select 1 from public.payment_disputes);
end $$;

select pg_temp.claim(4);
select pg_temp.expect_error($$select public.confirm_booking_payment((select id from public.payments where booking_id=pg_temp.booking_id(3)),null,null)$$,'ADMIN_NOTE_REQUIRED');
select public.confirm_booking_payment((select id from public.payments where booking_id=pg_temp.booking_id(3)),null,null,'Transfer verified with the rental owner.');
select public.admin_resolve_payment_dispute((select id from public.payment_disputes where booking_id=pg_temp.booking_id(5)),true,'Support reviewed the wallet records.');
select pg_temp.expect_error($$select public.admin_set_payment_hardening_settings(24,1,2,3,200,'Invalid review hours.')$$,'Check the payment setting ranges.');
select public.admin_set_payment_hardening_settings(24,12,2,4,200,'Adjust refund deadline for the marketplace.');

reset role;
select pg_temp.claim(null);
update public.booking_refunds set due_at=now()-interval '3 days' where booking_id=pg_temp.booking_id(6);
select public.send_payment_review_reminders();
select public.send_payment_review_reminders();

update public.bookings set payment_resubmit_due_at=now()-interval '1 minute' where id=pg_temp.booking_id(4);
set local role authenticated;
select pg_temp.claim(1);
select pg_temp.expect_error($$select public.submit_booking_payment(pg_temp.booking_id(4),'GRACE-123',pg_temp.object_path(4,3))$$,'PAYMENT_WINDOW_EXPIRED');
select public.open_payment_dispute(pg_temp.booking_id(4),'paid_not_confirmed','My proof was rejected after I transferred.');
do $$ begin
  assert (select payment_resubmit_due_at<now() from public.bookings where id=pg_temp.booking_id(4));
end $$;
reset role;
select pg_temp.claim(null);

do $$
declare verification jsonb;
begin
  assert (select count(*)=1 from public.booking_refunds where booking_id=pg_temp.booking_id(1));
  assert (select count(*)=2 from public.payment_receipts where booking_id in (pg_temp.booking_id(1),pg_temp.booking_id(3)));
  assert exists(select 1 from public.payments where booking_id=pg_temp.booking_id(3) and confirmed_channel='admin' and 'admin_confirmed'=any(flags));
  assert exists(select 1 from public.audit_log where action='payment.admin_confirmed' and reason='Transfer verified with the rental owner.');
  assert exists(select 1 from public.audit_log where entity_id='refund_due_days' and reason='Adjust refund deadline for the marketplace.');
  assert (select count(*)=1 from public.admin_alert_queue where event_key='payment.refund_overdue');
  assert (select count(*)=1 from public.owner_payment_events where kind='refund_overdue' and booking_id=pg_temp.booking_id(6));
  select to_jsonb(summary) into verification from public.public_payment_confirmation((
    select public_code from public.payment_receipts where booking_id=pg_temp.booking_id(1))) summary;
  assert verification ?& array['receipt_no','status','created_at','amount','vehicle','owner_name'];
  assert (select count(*)=6 from jsonb_object_keys(verification));
  assert not has_function_privilege('anon','public.submit_booking_payment(uuid,text,text)','execute');
  assert not has_function_privilege('anon','public.confirm_booking_payment(uuid,numeric,text,text)','execute');
  assert not has_function_privilege('anon','public.public_payment_confirmation(text)','execute');
  assert not has_function_privilege('authenticated','public.set_payment_proof_hash(uuid,text)','execute');
  assert not has_table_privilege('anon','public.payment_receipts','select');
end $$;

-- Three rejected proofs exhaust the same booking's attempt limit. A fresh
-- proof under review still cannot be confirmed after its review deadline.
set local role authenticated;
select pg_temp.claim(1);
select public.submit_booking_payment(pg_temp.booking_id(9),'ATTEMPT-001',pg_temp.object_path(9));
select pg_temp.claim(2);
select public.reject_booking_payment((select id from public.payments where reference_no='ATTEMPT-001'),'Amount not received');
select pg_temp.claim(1);
select public.submit_booking_payment(pg_temp.booking_id(9),'ATTEMPT-002',pg_temp.object_path(9,2));
select pg_temp.claim(2);
select public.reject_booking_payment((select id from public.payments where reference_no='ATTEMPT-002'),'Amount not received');
select pg_temp.claim(1);
select public.submit_booking_payment(pg_temp.booking_id(9),'ATTEMPT-003',pg_temp.object_path(9,3));
do $$ begin
  assert (select 'repeat_rejections'=any(flags) from public.payments where reference_no='ATTEMPT-003');
end $$;

reset role;
select pg_temp.claim(null);
update public.bookings set review_due_at=now()-interval '1 minute' where id=pg_temp.booking_id(5);
set local role authenticated;
select pg_temp.claim(2);
select pg_temp.expect_error($$select public.confirm_booking_payment(
  (select id from public.payments where reference_no='DISPUTE-123'),3600,'DISPUTE-123')$$,'PAYMENT_REVIEW_EXPIRED');
select public.reject_booking_payment((select id from public.payments where reference_no='ATTEMPT-003'),'Amount not received');
select pg_temp.claim(1);
select pg_temp.expect_error($$select public.submit_booking_payment(pg_temp.booking_id(9),'ATTEMPT-004',pg_temp.object_path(9,4))$$,'PROOF_LIMIT');

reset role;
select pg_temp.claim(null);
do $$ begin
  for attempt in 1..25 loop
    assert public.take_payment_request('receipt','test-client');
  end loop;
  assert not public.take_payment_request('receipt','test-client');
end $$;

-- A credit-mode owner can cover one expensive reservation. A later debit
-- exercises the persisted, one-time extension and the audited admin override.
update public.owners set fee_mode='credits' where id=pg_temp.owner_id(2);
insert into public.owner_credit_ledger(owner_id,type,amount) values (pg_temp.owner_id(2),'adjustment',600);
select pg_temp.create_booking(7,2);
select pg_temp.expect_error($$select pg_temp.create_booking(8,2)$$,'unavailable for bookings');
insert into public.owner_credit_ledger(owner_id,type,amount) values (pg_temp.owner_id(2),'adjustment',-100);

set local role authenticated;
select pg_temp.claim(1);
select public.submit_booking_payment(pg_temp.booking_id(7),'CREDIT-123',pg_temp.object_path(7));
select pg_temp.claim(3);
do $$
declare
  proof uuid := (select id from public.payments where booking_id=pg_temp.booking_id(7));
  original_due timestamptz := (select review_due_at from public.bookings where id=pg_temp.booking_id(7));
begin
  assert public.confirm_booking_payment(proof,3600,'CREDIT-123')='CREDITS_SHORT';
  assert public.confirm_booking_payment(proof,3600,'CREDIT-123')='CREDITS_SHORT';
  assert (select review_due_at=original_due+interval '12 hours' and status='payment_review'
    and 'owner_credit_short'=any(payment_flags) from public.bookings where id=pg_temp.booking_id(7));
end $$;
select pg_temp.claim(4);
select public.confirm_booking_payment((select id from public.payments where booking_id=pg_temp.booking_id(7)),null,null,'Support verified the paid transfer.');
do $$ begin
  assert (select balance=-100 from public.owner_credit_state(pg_temp.owner_id(2)));
end $$;

rollback;
