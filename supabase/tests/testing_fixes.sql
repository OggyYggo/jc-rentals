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

insert into storage.objects(bucket_id,name)
select 'payment-proofs',pg_temp.object_path(n,a) from generate_series(1,9) n cross join generate_series(1,4) a;
insert into storage.objects(bucket_id,name)
values ('refund-proofs', pg_temp.person(2)||'/'||pg_temp.booking_id(1)||'/refund.webp');

-- Exercise the server-only path, including the former missing pickup time.
update public.profiles set license_path=pg_temp.person(1)||'/license/fixture.webp',
  id_path=pg_temp.person(1)||'/id/fixture.pdf' where id=pg_temp.person(1);
update public.profiles set verification='approved',license_classes=array['car'] where id=pg_temp.person(1);
update public.cars set allows_with_driver=true where id=pg_temp.car_id(1);
insert into public.car_rates(car_id,mode,daily_rate) values(pg_temp.car_id(1),'with_driver',12000);
set local role authenticated;
select pg_temp.claim(1);
do $$ begin
  assert not has_column_privilege('authenticated','public.bookings','cancellation_policy_version','INSERT');
  assert not has_column_privilege('authenticated','public.bookings','car_id','INSERT');
  assert not has_function_privilege('authenticated',
    'public.create_policy_accepted_booking(uuid,uuid,public.rental_mode,date,date,time,text,text,text,uuid,uuid,text)','EXECUTE');
end $$;
select pg_temp.expect_error($$select public.admin_set_customer_verification(pg_temp.person(1),'rejected','Not allowed')$$,'Administrator access required.');

reset role;
select pg_temp.claim(null);
set local role service_role;
select pg_temp.expect_error($$select public.create_policy_accepted_booking(pg_temp.person(1),pg_temp.car_id(1),
  'self_drive',current_date+80,current_date+81,null,null,null,null,null,null,null)$$,'BOOKING_POLICY_REQUIRED');
select pg_temp.expect_error($$select public.create_policy_accepted_booking(pg_temp.person(1),pg_temp.car_id(1),
  'with_driver',current_date+80,current_date+81,null,'Hotel','Airport transfer','2026-11-21',null,null,null)$$,'Invalid pickup details.');
select public.create_policy_accepted_booking(pg_temp.person(1),pg_temp.car_id(1),
  'with_driver',current_date+80,current_date+81,'08:30','Hotel','Airport transfer','2026-11-21',null,null,null);
select public.create_policy_accepted_booking(pg_temp.person(1),pg_temp.car_id(1),
  'self_drive',current_date+85,current_date+86,null,null,null,'2026-11-21',null,null,null);
do $$ begin assert auth.uid() is null; end $$;

reset role;
do $$ begin
  assert (select count(*)=2 from public.bookings where cancellation_policy_version='2026-11-21' and cancellation_policy_accepted_at is not null);
  assert exists(select 1 from public.bookings where mode='with_driver' and pickup_time='08:30' and pickup_location='Hotel');
  assert (select count(*)=2 from public.audit_log a join public.bookings b on a.entity_id=b.id::text
    where b.cancellation_policy_version='2026-11-21' and a.actor_id=pg_temp.person(1));
end $$;

set local role authenticated;
select pg_temp.claim(1);
do $$
declare original uuid;
begin
  original := public.submit_booking_payment(pg_temp.booking_id(1),'RETRY-123',pg_temp.object_path(1));
  assert public.submit_booking_payment(pg_temp.booking_id(1),'RETRY-123',pg_temp.object_path(1,2))=original;
  assert (select count(*)=1 from public.payments where booking_id=pg_temp.booking_id(1));
  assert exists(select 1 from public.payments where id=original and proof_path=pg_temp.object_path(1));
end $$;
select pg_temp.expect_error($$select public.submit_booking_payment(pg_temp.booking_id(2),'retry 123',pg_temp.object_path(2))$$,'REFERENCE_ALREADY_USED');
select pg_temp.claim(2);
select public.confirm_booking_payment((select id from public.payments where booking_id=pg_temp.booking_id(1)),3600,'RETRY-123');
select pg_temp.claim(1);
do $$ begin
  assert public.submit_booking_payment(pg_temp.booking_id(1),'RETRY-123',pg_temp.object_path(1,3)) =
    (select id from public.payments where booking_id=pg_temp.booking_id(1) and status='verified');
end $$;
select pg_temp.expect_error($$select public.submit_booking_payment(pg_temp.booking_id(2),'RETRY-123',pg_temp.object_path(2))$$,'REFERENCE_ALREADY_USED');
select public.submit_booking_payment(pg_temp.booking_id(2),'REJECT-123',pg_temp.object_path(2));
select pg_temp.claim(2);
select public.reject_booking_payment((select id from public.payments where booking_id=pg_temp.booking_id(2)),'Blurry screenshot');
select pg_temp.claim(1);
select public.submit_booking_payment(pg_temp.booking_id(2),'REJECT-123',pg_temp.object_path(2,2));
reset role;
do $$ begin
  begin
    update public.payments set status='pending',reference_no='OTHER-123' where booking_id=pg_temp.booking_id(2) and status='rejected';
    raise exception 'Expected a second pending proof to fail';
  exception when unique_violation then
    assert sqlerrm like '%payments_one_pending_per_booking%', sqlerrm;
  end;
end $$;

set local role authenticated;
select pg_temp.claim(4);
select pg_temp.expect_error($$select public.admin_set_customer_verification(pg_temp.person(5),'approved',null)$$,'Both verification documents are required.');
select pg_temp.expect_error($$select public.admin_set_customer_verification(pg_temp.person(1),'rejected','  bad ')$$,'Enter a reason of 5 to 300 characters.');
select public.admin_set_customer_verification(pg_temp.person(1),'rejected','Please upload a clearer government ID.');
select pg_temp.claim(1);
do $$ begin
  assert (select verification='rejected' and verification_rejection_reason='Please upload a clearer government ID.'
    from public.profiles where id=auth.uid());
end $$;
select pg_temp.claim(4);
select public.admin_set_customer_verification(pg_temp.person(1),'approved');
select pg_temp.claim(1);
update public.profiles set id_path=pg_temp.person(1)||'/id/replacement.pdf' where id=auth.uid();
do $$ begin
  assert (select verification='pending' and verification_rejection_reason is null from public.profiles where id=auth.uid());
  assert not has_function_privilege('anon','public.admin_set_customer_verification(uuid,public.verification_status,text)','EXECUTE');
end $$;
select pg_temp.claim(4);
select public.admin_set_customer_verification(pg_temp.person(1),'approved',null);
select public.admin_log_event('document.viewed','customer',pg_temp.person(1)::text,jsonb_build_object('document','ID'));
do $$ begin
  assert exists(select 1 from public.audit_log where action='document.viewed' and entity_id=pg_temp.person(1)::text and metadata->>'document'='ID');
end $$;
rollback;
